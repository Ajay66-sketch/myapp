// src/core/circuitBreaker.js
// Enterprise Circuit Breaker resilient state machine

const eventBus = require('../telemetry/eventBus');

class CircuitBreaker {
  constructor(name, options = {}) {
    this.name = name;
    this.failureThreshold = options.failureThreshold || 5; // count before opening
    this.cooldownPeriod = options.cooldownPeriod || 10000; // cooldown window (ms)
    this.state = 'CLOSED'; // CLOSED | OPEN | HALF_OPEN
    this.failures = 0;
    this.lastFailureTime = null;
  }

  /**
   * Execute protected promise-based execution logic
   * 
   * @param {function} action - Target promise logic
   * @param {function} [fallback] - Graceful backup action
   */
  async execute(action, fallback) {
    if (this.state === 'OPEN') {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed > this.cooldownPeriod) {
        this.state = 'HALF_OPEN';
        eventBus.emit('circuit:half_open', 'warn', { service: this.name });
      } else {
        // Direct instantaneous route to fallback
        if (fallback) return fallback();
        throw new Error(`Circuit breaker [${this.name}] is OPEN`);
      }
    }

    try {
      const result = await action();
      
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
        eventBus.emit('circuit:closed', 'info', { service: this.name });
      }

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      eventBus.emit('circuit:failure', 'warn', { 
        service: this.name, 
        error: error.message, 
        failures: this.failures 
      });

      if (this.state === 'CLOSED' && this.failures >= this.failureThreshold) {
        this.state = 'OPEN';
        eventBus.emit('circuit:open', 'error', { service: this.name, threshold: this.failureThreshold });
      } else if (this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        eventBus.emit('circuit:open', 'error', { service: this.name, message: 'Failed during half-open trial' });
      }

      if (fallback) return fallback();
      throw error;
    }
  }
}

const registry = new Map();

/**
 * Fetch or instantiate a breaker instance
 */
function getBreaker(name, options) {
  if (!registry.has(name)) {
    registry.set(name, new CircuitBreaker(name, options));
  }
  return registry.get(name);
}

module.exports = {
  getBreaker,
  CircuitBreaker
};
