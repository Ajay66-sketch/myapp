// src/telemetry/eventBus.js
// Centralized Event Bus capturing system-wide metrics

const EventEmitter = require('events');
const os = require('os');

class TelemetryEventBus extends EventEmitter {
  constructor() {
    super();
    this.nodeId = process.env.NODE_ID || os.hostname() || 'node-1';
  }

  /**
   * Emit telemetry event
   * 
   * @param {string} eventType - Event type (e.g., 'socket:connect', 'redis:error')
   * @param {string} severity - "info" | "warn" | "error"
   * @param {object} payload - Event payload
   * @param {string} [userId] - Optional User ID
   */
  emit(eventType, severity = 'info', payload = {}, userId = null) {
    const event = {
      eventType,
      userId,
      nodeId: this.nodeId,
      timestamp: Date.now(),
      severity,
      payload
    };

    // Emit globally via '*' and specifically via eventType
    super.emit('*', event);
    super.emit(eventType, event);

    // Dynamic Redis publishing (if connected)
    try {
      const { getRedisClient } = require('../config/redisClient');
      const redisClient = getRedisClient();
      if (redisClient && redisClient.status === 'ready') {
        redisClient.publish('telemetry:events', JSON.stringify(event)).catch(() => {});
      }
    } catch (err) {
      // Catch early lifecycle/import exceptions silently
    }
  }

  /**
   * Subscribe to all telemetry events
   * 
   * @param {function} listener - Event listener callback
   * @returns {function} Unsubscribe helper
   */
  subscribe(listener) {
    this.on('*', listener);
    return () => this.off('*', listener);
  }
}

module.exports = new TelemetryEventBus();
