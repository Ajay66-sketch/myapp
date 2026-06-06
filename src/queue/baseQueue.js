// src/queue/baseQueue.js
// Production-grade resilient queue wrapper for high-throughput distributed systems.
// Separates the Producer runtime (Queue) from the Consumer runtime (Worker) to protect the main API process loop.

const { Queue, Worker } = require('bullmq');
const EventEmitter = require('events');
const crypto = require('crypto');
const systemEventBus = require('../telemetry/eventBus');
const IdempotencyKey = require('../models/IdempotencyKey');
require('../config/infraState');
require('../config/infraReconciler');

const { getRedisClient } = require('../config/redisClient');

const QUEUE_STATES = {
  NORMAL: 'NORMAL',
  DEGRADED: 'DEGRADED',
  DRAINING: 'DRAINING'
};

async function checkAndMarkIdempotency(key, redis) {
  // 1. Redis SETNX check (preferred)
  if (redis && redis.status === 'ready') {
    try {
      const redisKey = `idempotency:${key}`;
      const acquired = await redis.set(redisKey, 'processing', 'EX', 86400, 'NX');
      if (acquired === 'OK') {
        return { status: null };
      }
      const currentStatus = await redis.get(redisKey);
      return { status: currentStatus || 'processing' };
    } catch (err) {
      console.error(`[CHAOS][ERROR][IDEMPOTENCY] Redis SETNX failed, falling back to MongoDB: ${err.message}`);
    }
  }

  // 2. MongoDB persistent check
  try {
    const newDoc = new IdempotencyKey({ key, status: 'processing' });
    await newDoc.save();
    return { status: null };
  } catch (err) {
    if (err.code === 11000) {
      try {
        const existing = await IdempotencyKey.findOne({ key });
        return { status: existing ? existing.status : 'processing' };
      } catch (findErr) {
        console.error(`[CHAOS][ERROR][IDEMPOTENCY] MongoDB find failed, falling back to Memory: ${findErr.message}`);
      }
    } else {
      console.error(`[CHAOS][ERROR][IDEMPOTENCY] MongoDB save failed, falling back to Memory: ${err.message}`);
    }
  }

  // 3. In-Memory fallback cache check
  if (!global.__idempotencyCache) {
    global.__idempotencyCache = new Map();
  }
  const currentStatus = global.__idempotencyCache.get(key);
  if (!currentStatus) {
    global.__idempotencyCache.set(key, 'processing');
    setTimeout(() => {
      if (global.__idempotencyCache) {
        global.__idempotencyCache.delete(key);
      }
    }, 86400 * 1000);
    return { status: null };
  }
  return { status: currentStatus };
}

async function markIdempotencyDone(key, redis) {
  if (redis && redis.status === 'ready') {
    try {
      const redisKey = `idempotency:${key}`;
      await redis.set(redisKey, 'done', 'EX', 86400);
    } catch (err) {
      console.error(`[CHAOS][ERROR][IDEMPOTENCY] Redis done state update failed: ${err.message}`);
    }
  }

  try {
    await IdempotencyKey.updateOne({ key }, { status: 'done' }, { upsert: true });
  } catch (err) {
    console.error(`[CHAOS][ERROR][IDEMPOTENCY] MongoDB done state update failed: ${err.message}`);
  }

  if (global.__idempotencyCache) {
    global.__idempotencyCache.set(key, 'done');
  }
}

class ResilientQueue extends EventEmitter {
  constructor(queueName, processor, options = {}) {
    super();
    this.name = queueName;
    this.processor = processor;
    this.maxRetries = options.maxRetries || 5;
    this.initialDelayMs = options.initialDelayMs || 2000;
    
    // Bounded in-memory hold counter (no RAM array/map persistence)
    this.pendingRequestsCount = 0;
    this.maxBufferLength = 10000;
    
    this.metrics = {
      added: 0,
      completed: 0,
      failed: 0,
      retried: 0,
      dlqCount: 0
    };

    this.isBullMqActive = false;
    this.bullQueue = null;
    this.state = QUEUE_STATES.NORMAL;
    this.flushChain = Promise.resolve();
    this.__initialized = false; // Identity initialization lock (Fix 4)

    // Register queue instance globally for SRE tracking
    global.__allQueues = global.__allQueues || [];
    global.__allQueues.push(this);

    this.init();
  }

  get fallbackJobs() {
    return {
      length: this.pendingRequestsCount || 0,
      shift: () => {
        if (this.pendingRequestsCount > 0) this.pendingRequestsCount--;
        return { data: {} };
      },
      push: () => {
        this.pendingRequestsCount++;
      },
      unshift: () => {
        this.pendingRequestsCount++;
      }
    };
  }

  init() {
    // Hard Guard preventing multiple initializations (Fix 4)
    if (this.__initialized) {
      return;
    }
    this.__initialized = true;

    // Check central system of record instead of direct status/events
    if (global.__INFRA_STATE && global.__INFRA_STATE.redis.status === 'READY') {
      this.ensureQueueActive().catch(() => {});
    } else {
      this.enterDegradedMode();
    }
  }

  async ensureQueueActive() {
    if (!this.isBullMqActive || this.state === QUEUE_STATES.DEGRADED) {
      await this.handleConnect();
    }
  }

  enterDegradedMode() {
    if (this.state !== QUEUE_STATES.DEGRADED || this.isBullMqActive) {
      this.handleDisconnect();
    }
  }

  async recreateBullQueue() {
    console.warn(`[CHAOS][AUTO-RECOVERY] Recreating BullMQ instance for queue: ${this.name}`);
    try {
      if (this.bullQueue) {
        await this.bullQueue.close().catch(() => {});
        this.bullQueue = null;
      }
      const connection = getRedisClient();
      if (connection && connection.status === 'ready') {
        this.bullQueue = new Queue(this.name, { connection });
        this.isBullMqActive = true;
        console.log(`[CHAOS][AUTO-RECOVERY] Successfully recreated BullMQ instance for queue: ${this.name}`);
      } else {
        this.isBullMqActive = false;
        this.state = QUEUE_STATES.DEGRADED;
      }
    } catch (err) {
      console.error(`[CHAOS][ERROR][AUTO-RECOVERY] Failed to recreate BullMQ instance for queue ${this.name}:`, err.message);
    }
  }

  async handleConnect() {
    if (this.isBullMqActive && this.state !== QUEUE_STATES.DEGRADED) return;
    
    console.log(`[Queue: ${this.name}] Redis connected. Activating BullMQ producer...`);
    try {
      if (!this.bullQueue) {
        // Enforce shared global.__redisClient singleton reuse (Fix 5)
        const connection = getRedisClient();
        this.bullQueue = new Queue(this.name, { connection });
      }
      this.isBullMqActive = true;

      systemEventBus.emit('infra:redis:state', 'info', { status: 'UP' });

      // On reconnect, transition to DRAINING sequentially
      if (this.state === QUEUE_STATES.DEGRADED) {
        console.log('[CHAOS][FAILOVER] state transition: DRAINING');
        this.state = QUEUE_STATES.DRAINING;

        if (this.pendingRequestsCount > 0) {
          console.log(`[FAILOVER] Redis reconnected → sequentially flushing ${this.pendingRequestsCount} held jobs...`);
          this.emit('reconnected');

          while (this.pendingRequestsCount > 0) {
            await new Promise((resolve) => setTimeout(resolve, 10));
          }
        }

        console.log('[CHAOS][FAILOVER] state transition: NORMAL');
        this.state = QUEUE_STATES.NORMAL;
        systemEventBus.emit('infra:queue:state', 'info', { status: 'ACTIVE' });
      }
    } catch (err) {
      console.error(`[CHAOS][ERROR][QUEUE] Failed to initialize BullMQ on reconnect:`, err.message);
    }
  }

  handleDisconnect() {
    if (this.state !== QUEUE_STATES.DEGRADED) {
      console.warn(`[FAILOVER] Redis disconnected → switching to in-memory queue buffer`);
      console.warn(`[CHAOS][DEGRADED MODE] Redis unavailable → queue disabled`);
      console.log('[CHAOS][FAILOVER] state transition: DEGRADED');
      this.isBullMqActive = false;
      this.state = QUEUE_STATES.DEGRADED;

      systemEventBus.emit('infra:redis:state', 'warn', { status: 'DOWN' });
      systemEventBus.emit('infra:queue:state', 'warn', { status: 'DEGRADED' });
    }
  }

  /**
   * Enqueue job for background processing.
   * Bounded hold counter handles graceful degradation when Redis is offline.
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
    let priority = undefined;
    if (options.priority !== undefined) {
      priority = options.priority;
    } else if (payload && payload.userId) {
      try {
        const userRepository = require('../repositories/UserRepository');
        const user = await userRepository.get(payload.userId.toString());
        if (user && (user.tier === 'pro' || user.tier === 'admin')) {
          priority = 1;
        }
      } catch (err) {
        console.error(`[CHAOS][ERROR][QUEUE] UserRepository resolution failed: ${err.message}`);
      }
    }

    // Direct BullMQ path when healthy
    if (this.state === QUEUE_STATES.NORMAL && this.isBullMqActive && this.bullQueue) {
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
        console.error(`[CHAOS][ERROR][QUEUE] BullMQ add failed: ${err.message}`);
        this.handleDisconnect();
      }
    }

    // Bounded Fallback Hold and Enqueue (No memory-based persistence of payloads)
    const MAX_QUEUE_LIMIT = 1000;
    const limit = this.maxBufferLength || MAX_QUEUE_LIMIT;
    if (this.pendingRequestsCount >= limit) {
      global.__rejectedJobsCount = (global.__rejectedJobsCount || 0) + 1;
      console.error(`[CHAOS][QUEUE][THROTTLE] capacity reached → rejecting request`);
      const errMessage = `[Queue: ${this.name}] Bounded in-memory queue buffer full (10k limit exceeded). Dropping job to prevent memory exhaustion.`;
      console.error(`[CHAOS][FAILOVER] ${errMessage}`);
      const limitErr = new Error(errMessage);
      limitErr.statusCode = 503;
      throw limitErr;
    }

    // Increment hold counter
    this.pendingRequestsCount++;

    const mockJobRecord = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      data: payload,
      attempts: 0,
      createdAt: Date.now(),
      priority
    };

    // Sequential reconnect direct enqueue promise chain (held in promise closures)
    new Promise((resolve) => {
      this.once('reconnected', () => {
        this.flushChain = this.flushChain.then(async () => {
          try {
            if (this.bullQueue) {
              const job = await this.bullQueue.add(`${this.name}-job`, payload, {
                attempts: options.attempts || this.maxRetries,
                priority
              });
              resolve(job);
            } else {
              resolve(mockJobRecord);
            }
          } catch (err) {
            console.error(`[CHAOS][ERROR][QUEUE] Direct reconnect enqueue failed: ${err.message}`);
            resolve(mockJobRecord);
          } finally {
            if (this.pendingRequestsCount > 0) this.pendingRequestsCount--;
          }
        });
      });
    });

    systemEventBus.emit('queue:job_added', 'info', { queue: this.name, jobId: mockJobRecord.id, provider: 'memory' }, 'system');
    
    return mockJobRecord;
  }

  /**
   * Factory method to spin up a dedicated worker thread for this queue.
   */
  createWorker(options = {}) {
    // Enforce shared global.__redisClient singleton reuse (Fix 5)
    const connection = getRedisClient();

    console.log(`👷 [Worker: ${this.name}] Starting dedicated consumer client...`);

    const workerId = `${this.name}-${process.pid}-${Date.now()}`;
    const staleThresholdMs = options.timeoutMs || 30000;

    const worker = new Worker(this.name, async (job) => {
      // 1. Register worker activity start
      global.__WORKER_REGISTRY = global.__WORKER_REGISTRY || new Map();
      const entry = global.__WORKER_REGISTRY.get(workerId);
      if (entry) {
        entry.lastProcessedAt = Date.now();
        entry.jobCount++;
      }

      const userId = job.data?.userId || 'system';
      const jobType = this.name;
      const requestId = job.data?.requestId || job.id || job.data?.testId || '';
      
      // Hash-based idempotency key definition
      const idempotencyKey = crypto.createHash('sha256')
        .update(userId + jobType + requestId)
        .digest('hex');
      job.idempotencyKey = idempotencyKey;

      const redis = getRedisClient();
      let check;
      try {
        check = await checkAndMarkIdempotency(idempotencyKey, redis);
      } catch (err) {
        console.error(`[CHAOS][ERROR][WORKER_${this.name.toUpperCase()}] Idempotency check failed: ${err.message}`);
        check = { status: null };
      }

      if (check.status === 'done' || check.status === 'completed') {
        global.__idempotencyHits = (global.__idempotencyHits || 0) + 1;
        console.warn(`[CHAOS][IDEMPOTENCY] duplicate execution prevented`);
        return { deduplicated: true, status: 'completed' };
      }

      if (check.status === 'processing') {
        let retries = 0;
        try {
          if (redis && redis.status === 'ready') {
            const retryCountKey = `job:retry:${job.id}`;
            retries = parseInt(await redis.get(retryCountKey) || '0', 10);
            if (retries >= 1) {
              console.warn(`[CHAOS][IDEMPOTENCY] duplicate execution prevented`);
              return { skipped: true, reason: 'max_retries_exceeded' };
            }
            await redis.incr(retryCountKey);
            await redis.expire(retryCountKey, 300);
          } else {
            if (!global.__retryCache) {
              global.__retryCache = new Map();
            }
            retries = global.__retryCache.get(job.id) || 0;
            if (retries >= 1) {
              console.warn(`[CHAOS][IDEMPOTENCY] duplicate execution prevented`);
              return { skipped: true, reason: 'max_retries_exceeded' };
            }
            global.__retryCache.set(job.id, retries + 1);
          }
        } catch (err) {
          console.error(`[CHAOS][ERROR][WORKER_${this.name.toUpperCase()}] Retry validation failed: ${err.message}`);
        }
        console.log(`[Worker: ${this.name}] Retrying job ${job.id} (attempt ${retries + 1}).`);
      }

      // Process job with timeout
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

        // Mark as done
        await markIdempotencyDone(idempotencyKey, redis);

        return result;
      } catch (err) {
        clearTimeout(timeoutId);
        console.error(`[CHAOS][ERROR][WORKER_${this.name.toUpperCase()}] ${err.message}`);
        throw err;
      }
    }, {
      connection,
      stalledInterval: 30000,
      maxStalledCount: 2,
      concurrency: options.concurrency || 5
    });

    // Register worker in global registry
    global.__WORKER_REGISTRY = global.__WORKER_REGISTRY || new Map();
    global.__WORKER_REGISTRY.set(workerId, {
      id: workerId,
      queueName: this.name,
      workerInstance: worker,
      lastProcessedAt: Date.now(),
      jobCount: 0,
      staleThresholdMs,
      concurrency: options.concurrency || 5
    });

    // Wire up events
    worker.on('completed', (job) => {
      this.metrics.completed++;
      systemEventBus.emit('queue:job_completed', 'info', { queue: this.name, jobId: job?.id, worker: 'bullmq' }, 'system');
      console.log(`✅ [Worker: ${this.name}] Job ${job?.id} completed successfully`);

      const entry = global.__WORKER_REGISTRY.get(workerId);
      if (entry) {
        entry.lastProcessedAt = Date.now();
      }
    });

    worker.on('failed', async (job, err) => {
      this.metrics.failed++;
      systemEventBus.emit('queue:job_failed', 'error', { queue: this.name, jobId: job?.id, error: err.message }, 'system');
      console.error(`[CHAOS][ERROR][WORKER_${this.name.toUpperCase()}] Job ${job?.id} failed: ${err.message}`);

      const entry = global.__WORKER_REGISTRY.get(workerId);
      if (entry) {
        entry.lastProcessedAt = Date.now();
      }

      // Handle DLQ transition if attempts exhausted
      if (job && job.attemptsMade >= job.opts.attempts) {
        try {
          const deadLetterQueue = require('./deadLetterQueue');
          this.metrics.dlqCount++;
          await deadLetterQueue.pushToDLQ(this.name, job.data, err.message, job.id);
        } catch (dlqErr) {
          console.error(`[CHAOS][ERROR][WORKER_${this.name.toUpperCase()}] DLQ transition failed: ${dlqErr.message}`);
        }
      }
    });

    // Worker Heartbeats (observability)
    const startHeartbeat = () => {
      const heartbeatInterval = setInterval(async () => {
        const redisClient = getRedisClient();
        if (!redisClient || redisClient.status !== 'ready' || (global.__INFRA_STATE && global.__INFRA_STATE.redis.status !== 'READY')) {
          return;
        }

        if (worker.isRunning()) {
          try {
            const healthKey = `worker:health:${this.name}:${process.pid}`;
            const data = {
              queueName: this.name,
              pid: process.pid,
              hostname: require('os').hostname(),
              status: 'running',
              lastHeartbeat: Date.now(),
              concurrency: worker.opts.concurrency || 5,
            };
            await redisClient.set(healthKey, JSON.stringify(data), 'EX', 15);
          } catch (e) {
            console.error(`[CHAOS][ERROR][WORKER_${this.name.toUpperCase()}] Heartbeat failed: ${e.message}`);
          }
        }
      }, 5000);

      worker.on('closed', () => {
        clearInterval(heartbeatInterval);
        const redisClient = getRedisClient();
        if (redisClient && redisClient.status === 'ready') {
          const key = `worker:health:${this.name}:${process.pid}`;
          redisClient.del(key).catch((err) => {
            console.error(`[CHAOS][ERROR][WORKER_${this.name.toUpperCase()}] Heartbeat delete failed: ${err.message}`);
          });
        }
        
        // Remove from registry
        if (global.__WORKER_REGISTRY) {
          global.__WORKER_REGISTRY.delete(workerId);
        }
      });
    };

    // Start heartbeat checking immediately (safely self-guards against offline states)
    startHeartbeat();

    return worker;
  }

  async close() {
    try {
      if (this.bullQueue) {
        await this.bullQueue.close();
      }
      console.log(`[Queue: ${this.name}] Successfully closed queue producer channels.`);
    } catch (err) {
      console.error(`[CHAOS][ERROR][QUEUE] Close failed: ${err.message}`);
    }
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
      pendingCount: this.pendingRequestsCount
    };
  }
}

module.exports = ResilientQueue;
