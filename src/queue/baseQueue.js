// src/queue/baseQueue.js
// Enterprise Queue Wrapper: Integrates BullMQ with standard exponential backoff retries & fail-safe fallback

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
    this.maxRetries = options.maxRetries || 3;
    this.initialDelayMs = options.initialDelayMs || 1000;
    
    // In-memory fallback structures
    this.fallbackJobs = [];
    this.deadLetterQueue = [];
    this.metrics = {
      added: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      dlqCount: 0
    };

    this.isBullMqActive = false;
    this.bullQueue = null;
    this.bullWorker = null;

    this.init();
  }

  init() {
    const redisClient = getRedisClient();
    const hasRedis = redisClient && redisClient.status === 'ready';

    if (hasRedis) {
      try {
        const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
        const connection = {
          host: process.env.REDIS_HOST || 'localhost',
          port: process.env.REDIS_PORT || 6379
        };

        this.bullQueue = new Queue(this.name, { connection });
        this.bullWorker = new Worker(this.name, async (job) => {
          return this.processor(job.data);
        }, { connection });

        this.bullWorker.on('completed', (job) => {
          this.metrics.completed++;
          systemEventBus.emit('queue:job_completed', 'info', { queue: this.name, jobId: job.id }, 'system');
        });

        this.bullWorker.on('failed', (job, err) => {
          this.metrics.failed++;
          systemEventBus.emit('queue:job_failed', 'error', { queue: this.name, jobId: job?.id, error: err.message }, 'system');
        });

        this.isBullMqActive = true;
        console.log(`[Queue: ${this.name}] Initialized via BullMQ.`);
      } catch (err) {
        console.warn(`[Queue: ${this.name}] BullMQ setup failed. Falling back to in-memory mode.`, err.message);
        this.isBullMqActive = false;
      }
    } else {
      console.log(`[Queue: ${this.name}] Initialized via Resilient In-Memory Fallback.`);
      this.isBullMqActive = false;
    }
  }

  /**
   * Enqueue job for background processing
   */
  async add(payload) {
    this.metrics.added++;
    
    if (this.isBullMqActive && this.bullQueue) {
      try {
        const job = await this.bullQueue.add(`${this.name}-job`, payload, {
          attempts: this.maxRetries,
          backoff: {
            type: 'exponential',
            delay: this.initialDelayMs
          }
        });
        systemEventBus.emit('queue:job_added', 'info', { queue: this.name, jobId: job.id, provider: 'bullmq' }, 'system');
        return;
      } catch (err) {
        console.warn(`[Queue: ${this.name}] BullMQ add failed, routing to local in-memory fallback.`, err.message);
      }
    }

    // Resilient Fallback Enqueue
    const jobRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      data: payload,
      attempts: 0,
      createdAt: Date.now()
    };

    this.fallbackJobs.push(jobRecord);
    systemEventBus.emit('queue:job_added', 'info', { queue: this.name, jobId: jobRecord.id, provider: 'memory' }, 'system');
    
    // Process async immediately on next tick without blocking
    process.nextTick(() => this.processNextFallbackJob());
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
        this.deadLetterQueue.push({ ...job, error: err.message });
        systemEventBus.emit('queue:dlq_pushed', 'error', { queue: this.name, jobId: job.id, attempts: job.attempts, error: err.message }, 'system');
      }
    }
  }

  /**
   * Graceful close / drain
   */
  async close() {
    if (this.bullWorker) {
      await this.bullWorker.close();
    }
    if (this.bullQueue) {
      await this.bullQueue.close();
    }
    console.log(`[Queue: ${this.name}] Successfully closed all queue channels.`);
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
