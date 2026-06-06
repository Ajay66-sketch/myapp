// src/core/serviceWrapper.js
// SRE-grade resilient service wrapper with integrated Circuit Breaker

const { getBreaker } = require('./circuitBreaker');
const systemEventBus = require('../telemetry/eventBus');

/**
 * Wrap a service call in a Circuit Breaker and try/catch error handler.
 * Prevents cascading failures and enforces graceful degradation.
 * 
 * @param {Function} fn - The actual function to execute
 * @param {string} serviceName - Name of the service (e.g. 'redis', 'razorpay', 'openai')
 * @param {Object} [options] - Resilience options
 * @param {Function} [options.fallback] - Fallback function to call if execution fails
 * @param {boolean} [options.throwOnError] - Whether to bubble up the error
 * @param {number} [options.failureThreshold] - Failures before tripping circuit
 * @param {number} [options.cooldownPeriod] - Time in ms before attempting reset
 */
function wrapService(fn, serviceName, options = {}) {
  const breaker = getBreaker(serviceName, {
    failureThreshold: options.failureThreshold || 3,
    cooldownPeriod: options.cooldownPeriod || 5000
  });

  return async (...args) => {
    try {
      const result = await breaker.execute(async () => {
        return await fn(...args);
      });
      
      // If it succeeds and we were degraded/down, self-register UP/ACTIVE via event bus
      if (serviceName === 'redis') {
        systemEventBus.emit('infra:redis:state', 'info', { status: 'UP' });
        systemEventBus.emit('infra:queue:state', 'info', { status: 'ACTIVE' });
      } else if (serviceName === 'razorpay') {
        systemEventBus.emit('infra:billing:state', 'info', { status: 'UP' });
      }
      
      return result;
    } catch (err) {
      // SRE observability requirements
      console.error(`[CHAOS][FAILOVER] Service [${serviceName}] failed: ${err.message}`);
      console.warn(`[CHAOS][DEGRADED MODE] ${serviceName} is operating in a degraded/failed state`);
      
      // Update state via event bus
      if (serviceName === 'redis') {
        systemEventBus.emit('infra:redis:state', 'warn', { status: 'DEGRADED' });
        systemEventBus.emit('infra:queue:state', 'warn', { status: 'DEGRADED' });
      } else if (serviceName === 'razorpay') {
        systemEventBus.emit('infra:billing:state', 'warn', { status: 'DEGRADED' });
      } else {
        systemEventBus.emit('infra:service:state', 'warn', { service: serviceName, status: 'DEGRADED' });
      }

      if (options.fallback) {
        try {
          return await options.fallback(...args);
        } catch (fallbackErr) {
          console.error(`[CHAOS][FAILOVER] Fallback for [${serviceName}] also failed: ${fallbackErr.message}`);
        }
      }

      if (options.throwOnError) {
        throw err;
      }

      return null;
    }
  };
}

module.exports = {
  wrapService
};
