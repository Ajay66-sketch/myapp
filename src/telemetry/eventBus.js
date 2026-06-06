// src/telemetry/eventBus.js
// Centralized Event Bus capturing system-wide metrics and enforcing event deduplication

const EventEmitter = require('events');
const os = require('os');

class TelemetryEventBus extends EventEmitter {
  constructor() {
    super();
    this.nodeId = process.env.NODE_ID || os.hostname() || 'node-1';
    
    // Globally increase listener count capacity for decoupled system subscribers (Fix 5/SRE)
    this.setMaxListeners(100);
    
    // In-memory registry to handle event debouncing/deduplication (Fix 6)
    this.debounceMap = new Map();
  }

  /**
   * Emit telemetry event with robust deduplication logic
   * 
   * @param {string} eventType - Event type (e.g., 'socket:connect', 'redis:error')
   * @param {string} severity - "info" | "warn" | "error"
   * @param {object} payload - Event payload
   * @param {string} [userId] - Optional User ID
   */
  emit(eventType, severity = 'info', payload = {}, userId = null) {
    const now = Date.now();

    const isInfraEvent = eventType.startsWith('redis:') || eventType.startsWith('queue:') || eventType.startsWith('worker:') || eventType.startsWith('infra:');

    if (!isInfraEvent) {
      // 1. Enforce global debounce limit of 200ms per eventType (Fix 6)
      const lastEventTime = this.debounceMap.get(eventType);
      if (lastEventTime && (now - lastEventTime < 200)) {
        // Suppress duplicate emission
        return false;
      }

      // 2. Enforce optional debounce key within payload (Fix 6)
      if (payload && payload.debounceKey) {
        const uniqueKey = `${eventType}:${payload.debounceKey}`;
        const lastKeyTime = this.debounceMap.get(uniqueKey);
        const debounceTimeout = payload.debounceMs || 200;
        
        if (lastKeyTime && (now - lastKeyTime < debounceTimeout)) {
          // Suppress duplicate emission
          return false;
        }
        
        this.debounceMap.set(uniqueKey, now);
        setTimeout(() => {
          this.debounceMap.delete(uniqueKey);
        }, debounceTimeout);
      }

      // Set last event type timestamp
      this.debounceMap.set(eventType, now);
      setTimeout(() => {
        this.debounceMap.delete(eventType);
      }, 200);
    }

    const event = {
      eventType,
      userId,
      nodeId: this.nodeId,
      timestamp: now,
      severity,
      payload
    };

    // Emit globally via '*' and specifically via eventType
    super.emit('*', event);
    super.emit(eventType, event);

    // Dynamic Redis publishing (if connected and ready)
    try {
      const { getRedisClient } = require('../config/redisClient');
      const redisClient = getRedisClient();
      if (redisClient && redisClient.status === 'ready') {
        redisClient.publish('telemetry:events', JSON.stringify(event)).catch(() => {});
      }
    } catch (err) {
      // Catch early lifecycle/import exceptions silently
    }

    return true;
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
