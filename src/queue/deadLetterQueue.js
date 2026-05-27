// src/queue/deadLetterQueue.js
// Durable SRE-grade Dead Letter Queue (DLQ) processor to isolate, audit, and retry failed operations

const systemEventBus = require('../telemetry/eventBus');
const mongoose = require('mongoose');

class DeadLetterQueue {
  constructor() {
    this.inMemoryStore = [];
    this.retriesMap = new Map();
  }

  /**
   * Move a failed queue job to the DLQ
   * @param {string} queueName Name of the originating task queue
   * @param {object} payload Task parameters
   * @param {string} errorReason Reason for failure
   * @param {string} [jobId] Optional original BullMQ job ID
   */
  async pushToDLQ(queueName, payload, errorReason, jobId = null) {
    const fallbackId = `dlq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const jId = jobId || fallbackId;

    const entry = {
      jobId: jId,
      queueName,
      payload,
      errorReason: errorReason || 'Unknown error occurred during processing',
      attemptsMade: 3, // standard default
      timestamp: new Date()
    };

    // 1. Try to persist to MongoDB
    if (mongoose.connection.readyState === 1) {
      try {
        const DeadLetterJob = require('../models/DeadLetterJob');
        const dbJob = await DeadLetterJob.create(entry);
        systemEventBus.emit('queue:dlq_pushed', 'error', { dlqId: dbJob._id, queue: queueName, reason: errorReason, storage: 'db' }, 'system');
        console.log(`📥 [DLQ] Failed job successfully persisted to MongoDB: ${dbJob._id}`);
        return dbJob._id.toString();
      } catch (err) {
        console.error('❌ [DLQ] Failed to save to MongoDB, reverting to in-memory fallback:', err.message);
      }
    }

    // 2. In-memory fallback storage
    const inMemoryEntry = { _id: fallbackId, ...entry };
    this.inMemoryStore.push(inMemoryEntry);
    systemEventBus.emit('queue:dlq_pushed', 'error', { dlqId: fallbackId, queue: queueName, reason: errorReason, storage: 'memory' }, 'system');

    // Prevent memory leaks / heap exhaustion by capping at 1000 items in-memory
    if (this.inMemoryStore.length > 1000) {
      this.inMemoryStore.shift();
    }
    
    return fallbackId;
  }

  /**
   * Retrieve all items inside the DLQ from both MongoDB and the transient in-memory store
   */
  async getDLQItems() {
    let dbItems = [];
    if (mongoose.connection.readyState === 1) {
      try {
        const DeadLetterJob = require('../models/DeadLetterJob');
        dbItems = await DeadLetterJob.find().sort({ createdAt: -1 }).limit(100);
      } catch (err) {
        console.error('[DLQ] Failed to fetch items from MongoDB:', err.message);
      }
    }
    // Combine with in-memory fallback items
    return [...this.inMemoryStore, ...dbItems];
  }

  /**
   * Attempt to retry a failed task from the DLQ
   */
  async retryTask(dlqId) {
    if (!dlqId) return false;

    let task = null;
    let isDbTask = false;

    // 1. Check if the task exists in-memory
    const memIdx = this.inMemoryStore.findIndex(item => item._id === dlqId);
    if (memIdx !== -1) {
      task = this.inMemoryStore[memIdx];
    } 
    
    // 2. Check if the task exists in MongoDB
    if (!task && mongoose.connection.readyState === 1) {
      try {
        const DeadLetterJob = require('../models/DeadLetterJob');
        task = await DeadLetterJob.findById(dlqId);
        if (task) isDbTask = true;
      } catch (err) {
        console.error('[DLQ] Failed to query job from MongoDB:', err.message);
      }
    }

    if (!task) {
      console.warn(`[DLQ] Task to retry was not found: ${dlqId}`);
      return false;
    }

    const attempts = this.retriesMap.get(dlqId) || 0;
    if (attempts >= 3) {
      systemEventBus.emit('queue:dlq_abandoned', 'error', { dlqId, queue: task.queueName }, 'system');
      return false; // Retries limit exceeded
    }

    this.retriesMap.set(dlqId, attempts + 1);
    
    try {
      // Dispatch task back to its originating queue
      console.log(`[DLQ] Re-dispatching task ${dlqId} to queue: ${task.queueName}`);
      let targetQueue = null;

      switch (task.queueName) {
        case 'ai-coach':
          const { aiQueue } = require('./aiQueue');
          targetQueue = aiQueue;
          break;
        case 'system-notifications':
          targetQueue = require('./notificationQueue');
          break;
        case 'ai-tutor-milestones':
          targetQueue = require('./aiTutorQueue');
          break;
        case 'study-analytics':
          targetQueue = require('./analyticsQueue');
          break;
        case 'telemetry-logs':
          targetQueue = require('./telemetryQueue');
          break;
        default:
          throw new Error(`Unknown queue name target: ${task.queueName}`);
      }

      if (targetQueue) {
        await targetQueue.add(task.payload);
      }

      // 3. Remove task from durable store
      if (isDbTask) {
        const DeadLetterJob = require('../models/DeadLetterJob');
        await DeadLetterJob.findByIdAndDelete(dlqId);
      } else if (memIdx !== -1) {
        this.inMemoryStore.splice(memIdx, 1);
      }

      this.retriesMap.delete(dlqId);
      systemEventBus.emit('queue:dlq_retried', 'info', { dlqId, queue: task.queueName }, 'system');
      console.log(`✅ [DLQ] Task ${dlqId} successfully retried and removed from store.`);
      return true;
    } catch (err) {
      console.warn(`❌ [DLQ] Retry attempt failed for task ${dlqId}:`, err.message);
      return false;
    }
  }
}

const sharedDLQ = new DeadLetterQueue();
module.exports = sharedDLQ;
