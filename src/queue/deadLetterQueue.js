// src/queue/deadLetterQueue.js
// SRE-grade Dead Letter Queue (DLQ) processor to isolate and audit failed background operations

const systemEventBus = require('../telemetry/eventBus');

class DeadLetterQueue {
  constructor() {
    this.dlqStore = [];
    this.retriesMap = new Map();
  }

  /**
   * Move a failed queue job to the DLQ
   * @param {string} queueName Name of the originating task queue
   * @param {object} payload Task parameters
   * @param {string} errorReason Reason for failure
   */
  async pushToDLQ(queueName, payload, errorReason) {
    const entry = {
      id: `dlq-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      queueName,
      payload,
      errorReason,
      timestamp: new Date().toISOString(),
    };

    this.dlqStore.push(entry);
    systemEventBus.emit('queue:dlq_pushed', 'error', { dlqId: entry.id, queue: queueName, reason: errorReason }, 'system');
    
    // Prune very old entries to prevent heap memory exhaustion in low-resource setups
    if (this.dlqStore.length > 5000) {
      this.dlqStore.shift();
    }
  }

  /**
   * Retrieve all items inside the DLQ
   */
  getDLQItems() {
    return this.dlqStore;
  }

  /**
   * Attempt to retry a failed task from the DLQ
   */
  async retryTask(dlqId) {
    const idx = this.dlqStore.findIndex(item => item.id === dlqId);
    if (idx === -1) return false;

    const task = this.dlqStore[idx];
    const attempts = this.retriesMap.get(dlqId) || 0;

    if (attempts >= 3) {
      systemEventBus.emit('queue:dlq_abandoned', 'error', { dlqId, queue: task.queueName }, 'system');
      return false; // Retries limit exceeded
    }

    this.retriesMap.set(dlqId, attempts + 1);
    
    try {
      // Dispatch back into queue processing
      if (task.queueName === 'ai-summary') {
        const aiQueue = require('./aiQueue');
        await aiQueue.add(task.payload);
      } else {
        const notificationQueue = require('./notificationQueue');
        await notificationQueue.add(task.payload);
      }

      // Remove from DLQ on successful retry re-trigger
      this.dlqStore.splice(idx, 1);
      this.retriesMap.delete(dlqId);
      systemEventBus.emit('queue:dlq_retried', 'info', { dlqId, queue: task.queueName }, 'system');
      return true;
    } catch (err) {
      console.warn(`[DLQ] Retry attempt failed for task ${dlqId}:`, err.message);
      return false;
    }
  }
}

const sharedDLQ = new DeadLetterQueue();
module.exports = sharedDLQ;
