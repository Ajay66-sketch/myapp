// src/queue/baseQueue.js
// Production-grade resilient queue wrapper for high-throughput distributed systems.
// Separates the Producer runtime (Queue) from the Consumer runtime (Worker) to protect the main API process loop.

const { Queue, Worker } = require('bullmq');
const systemEventBus = require('../telemetry/eventBus');

const getRedisClient = () => {
  try {
    const { getRedisClient: _get } = require('../config/redisClient');
    return _get();
  } catch (err) {
    return null;
  }
};

class ResilientQueue {
  constructor(queueName, processor, options = {}) {
    this.name = queueName;
    this.processor = processor;
    this.maxRetries = options.maxRetries || 5;
    this.initialDelayMs = options.initialDelayMs || 2000;
    
    // In-memory fallback structures
    this.fallbackJobs = [];
    this.metrics = {
      added: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      dlqCount: 0
    };

    this.isBullMqActive = false;
    this.bullQueue = null;

    this.init();
  }

  init() {
    const redisClient = getRedisClient();
    const hasRedis = redisClient && redisClient.status === 'ready';

    if (hasRedis) {
      try {
        const connection = {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379
        };

        // Standard BullMQ Queue definition (Producer Only!)
        // Main process only adds tasks. Dedicated workers consume them.
        this.bullQueue = new Queue(this.name, { connection });
        this.isBullMqActive = true;
        console.log(`[Queue: ${this.name}] Producer initialized via BullMQ.`);
      } catch (err) {
        console.warn(`[Queue: ${this.name}] BullMQ setup failed. Falling back to local queue mode.`, err.message);
        this.isBullMqActive = false;
      }
    } else {
      console.log(`[Queue: ${this.name}] Producer initialized via Resilient In-Memory Fallback.`);
      this.isBullMqActive = false;
    }
  }

  /**
   * Enqueue job for background processing.
   * Backward compatible with both add(payload, options) and add(name, payload, options).
   */
  async add(first, second = {}, third = {}) {
    this.metrics.added++;

    let payload;
    let options;

    if (typeof first === 'string') {
      payload = second;
      options = third;
    } else {
      payload = first;
      options = second;
    }
    
    // Premium User Priority Queue Routing
    // In BullMQ: 1 is the highest priority, then 2, 3, etc.
    let priority = undefined;
    if (options.priority !== undefined) {
      priority = options.priority;
    } else if (payload && payload.userId) {
      try {
        const userRepository = require('../repositories/UserRepository');
        const user = await userRepository.get(payload.userId.toString());
        if (user && (user.tier === 'pro' || user.tier === 'admin')) {
          priority = 1; // Highest priority tier for premium members
          console.log(`⭐ [Queue: ${this.name}] Prioritized job (priority: 1) for Premium user ${user.username}`);
        }
      } catch (err) {
        // Fallback silently if repository layers are not available
      }
    }

    if (this.isBullMqActive && this.bullQueue) {
      try {
        const job = await this.bullQueue.add(`${this.name}-job`, payload, {
          attempts: options.attempts || this.maxRetries,
          backoff: {
            type: 'exponential',
            delay: options.initialDelayMs || this.initialDelayMs
          },
          priority,
          timeout: options.timeout || 60000 // 60s default processing timeout
        });
        
        systemEventBus.emit('queue:job_added', 'info', { queue: this.name, jobId: job.id, priority, provider: 'bullmq' }, 'system');
        return job;
      } catch (err) {
        console.warn(`[Queue: ${this.name}] BullMQ add failed, routing to local in-memory fallback.`, err.message);
      }
    }

    // Resilient Fallback Enqueue
    const jobRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      data: payload,
      attempts: 0,
      createdAt: Date.now(),
      priority
    };

    this.fallbackJobs.push(jobRecord);
    systemEventBus.emit('queue:job_added', 'info', { queue: this.name, jobId: jobRecord.id, provider: 'memory' }, 'system');
    
    // Process async immediately on next tick without blocking
    process.nextTick(() => this.processNextFallbackJob());
    return jobRecord;
  }

  /**
   * Process in-memory fallback job asynchronously with exponential backoff retries
   */
  async processNextFallbackJob() {
    if (this.fallbackJobs.length === 0) return;

    const job = this.fallbackJobs.shift();
    try {
      await this.processor(job.data);
      this.metrics.completed++;
      systemEventBus.emit('queue:job_completed', 'info', { queue: this.name, jobId: job.id, provider: 'memory' }, 'system');
    } catch (err) {
      job.attempts++;
      this.metrics.retried++;
      
      if (job.attempts < this.maxRetries) {
        // Exponential backoff
        const backoffDelay = this.initialDelayMs * Math.pow(2, job.attempts - 1);
        systemEventBus.emit('queue:job_retry', 'warn', { queue: this.name, jobId: job.id, attempt: job.attempts, nextDelayMs: backoffDelay, error: err.message }, 'system');
        
        const timeoutId = setTimeout(() => {
          this.fallbackJobs.push(job);
          this.processNextFallbackJob();
        }, backoffDelay);
        
        try {
          const cleanupManager = require('../core/cleanupManager');
          cleanupManager.registerTimeout(timeoutId);
        } catch (e) {}
      } else {
        // Send to Dead-Letter Queue (DLQ)
        this.metrics.failed++;
        this.metrics.dlqCount++;
        const deadLetterQueue = require('./deadLetterQueue');
        await deadLetterQueue.pushToDLQ(this.name, job.data, err.message, job.id);
      }
    }
  }

  /**
   * Factory method to spin up a dedicated worker thread for this queue.
   * This is exclusively called by dedicated worker bootstrap processes.
   */
  createWorker(options = {}) {
    const connection = {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379
    };

    console.log(`👷 [Worker: ${this.name}] Starting dedicated consumer client...`);

    const worker = new Worker(this.name, async (job) => {
      const timeoutMs = options.timeoutMs || job.opts.timeout || 60000;
      
      let timeoutId;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(`JOB_TIMEOUT: Job processing exceeded safety limit of ${timeoutMs}ms`));
        }, timeoutMs);
      });
      
      try {
        const result = await Promise.race([
          this.processor(job.data),
          timeoutPromise
        ]);
        clearTimeout(timeoutId);
        return result;
      } catch (err) {
        clearTimeout(timeoutId);
        throw err;
      }
    }, {
      connection,
      stalledInterval: 30000,
      maxStalledCount: 2,
      concurrency: options.concurrency || 5 // concurrent workers
    });

    // Wire up events
    worker.on('completed', (job) => {
      this.metrics.completed++;
      systemEventBus.emit('queue:job_completed', 'info', { queue: this.name, jobId: job.id, worker: 'bullmq' }, 'system');
      console.log(`✅ [Worker: ${this.name}] Job ${job.id} completed successfully`);
    });

    worker.on('failed', async (job, err) => {
      this.metrics.failed++;
      systemEventBus.emit('queue:job_failed', 'error', { queue: this.name, jobId: job?.id, error: err.message }, 'system');
      console.error(`❌ [Worker: ${this.name}] Job ${job?.id} failed:`, err.message);

      // Handle DLQ transition if attempts exhausted
      if (job && job.attemptsMade >= job.opts.attempts) {
        try {
          const deadLetterQueue = require('./deadLetterQueue');
          this.metrics.dlqCount++;
          await deadLetterQueue.pushToDLQ(this.name, job.data, err.message, job.id);
        } catch (dlqErr) {
          console.error(`🚨 [Worker: ${this.name}] Critical failure enqueuing job ${job.id} to DLQ:`, dlqErr.message);
        }
      }
    });

    return worker;
  }

  /**
   * Graceful close / drain
   */
  async close() {
    if (this.bullQueue) {
      await this.bullQueue.close();
    }
    console.log(`[Queue: ${this.name}] Successfully closed queue producer channels.`);
  }

  getMetrics() {
    return {
      queueName: this.name,
      bullMqActive: this.isBullMqActive,
      added: this.metrics.added,
      completed: this.metrics.completed,
      failed: this.metrics.failed,
      retried: this.metrics.retried,
      dlqCount: this.metrics.dlqCount,
      pendingCount: this.fallbackJobs.length
    };
  }
}

module.exports = ResilientQueue;
