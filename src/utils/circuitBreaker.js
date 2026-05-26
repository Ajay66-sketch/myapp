// src/utils/circuitBreaker.js
// Enterprise-grade SRE Circuit Breaker implementation for third-party API dependencies

const systemEventBus = require('../telemetry/eventBus');

class CircuitBreaker {
  /**
   * @param {Function} requestFunction Async function wrap for API request
   * @param {object} options Config options
   */
  constructor(requestFunction, options = {}) {
    this.requestFunction = requestFunction;
    this.failureThreshold = options.failureThreshold || 5; // failures before opening
    this.cooldownMs = options.cooldownMs || 10000; // time in OPEN before trying HALF-OPEN
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.nextAttemptTime = 0;
  }

  async execute(...args) {
    const now = Date.now();

    if (this.state === 'OPEN') {
      if (now >= this.nextAttemptTime) {
        this.state = 'HALF_OPEN';
        systemEventBus.emit('circuit:state_change', 'info', { state: 'HALF_OPEN', request: this.requestFunction.name }, 'system');
      } else {
        // Fail fast: Circuit is currently open!
        throw new Error('Circuit Breaker is OPEN. Downstream API is temporarily unavailable.');
      }
    }

    try {
      const response = await this.requestFunction(...args);
      
      // Success resets count and closes circuit
      if (this.state === 'HALF_OPEN' || this.state === 'OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
        systemEventBus.emit('circuit:state_change', 'info', { state: 'CLOSED', request: this.requestFunction.name }, 'system');
      }
      return response;
    } catch (err) {
      this.failureCount++;
      
      if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
        this.state = 'OPEN';
        this.nextAttemptTime = now + this.cooldownMs;
        systemEventBus.emit('circuit:state_change', 'warn', { state: 'OPEN', request: this.requestFunction.name, nextAttempt: this.nextAttemptTime }, 'system');
      } else if (this.state === 'HALF_OPEN') {
        // Immediately return to OPEN on half-open canary failure
        this.state = 'OPEN';
        this.nextAttemptTime = now + this.cooldownMs;
        systemEventBus.emit('circuit:state_change', 'warn', { state: 'OPEN', request: this.requestFunction.name, message: 'Canary probe failed. Keeping open.' }, 'system');
      }
      
      throw err;
    }
  }
}

module.exports = CircuitBreaker;
