// src/core/cleanupManager.js
// Memory Leak Protector: Tracks background timers, tasks, and event subscriptions for graceful shutdown

const systemEventBus = require('../telemetry/eventBus');

const registeredIntervals = new Set();
const registeredTimeouts = new Set();
const registeredListeners = []; // Array of { emitter, eventName, listener }

/**
 * Register interval for centralized leakage tracking
 * @param {any} intervalId 
 */
function registerInterval(intervalId) {
  if (intervalId) {
    registeredIntervals.add(intervalId);
  }
}

/**
 * Deregister interval manually
 * @param {any} intervalId 
 */
function deregisterInterval(intervalId) {
  if (intervalId) {
    registeredIntervals.delete(intervalId);
  }
}

/**
 * Register timeout for tracking
 * @param {any} timeoutId 
 */
function registerTimeout(timeoutId) {
  if (timeoutId) {
    registeredTimeouts.add(timeoutId);
  }
}

/**
 * Deregister timeout manually
 * @param {any} timeoutId 
 */
function deregisterTimeout(timeoutId) {
  if (timeoutId) {
    registeredTimeouts.delete(timeoutId);
  }
}

/**
 * Register event listener subscription
 * @param {object} emitter - Node EventEmitter instance
 * @param {string} eventName - Target event
 * @param {function} listener - callback function
 */
function registerListener(emitter, eventName, listener) {
  if (!emitter || typeof emitter.on !== 'function') return;

  // Max listener protection warn
  const currentCount = emitter.listenerCount ? emitter.listenerCount(eventName) : 0;
  if (currentCount >= 10) {
    console.warn(`[Leak Protection] WARNING: Emitter has ${currentCount} listeners for event "${eventName}". Potential memory leak!`);
    systemEventBus.emit('leak:warning', 'warn', { eventName, listenerCount: currentCount }, 'system');
  }

  emitter.on(eventName, listener);
  registeredListeners.push({ emitter, eventName, listener });
}

/**
 * Clear all active timers, intervals, and event listener bindings
 */
function cleanupAll() {
  console.log(`[Cleanup Manager] Starting global resource sweep: ${registeredIntervals.size} intervals, ${registeredTimeouts.size} timeouts, ${registeredListeners.length} event subscriptions.`);

  // 1. Clear intervals
  for (const interval of registeredIntervals) {
    clearInterval(interval);
  }
  registeredIntervals.clear();

  // 2. Clear timeouts
  for (const timeout of registeredTimeouts) {
    clearTimeout(timeout);
  }
  registeredTimeouts.clear();

  // 3. Clear event listeners
  for (const { emitter, eventName, listener } of registeredListeners) {
    try {
      if (typeof emitter.off === 'function') {
        emitter.off(eventName, listener);
      } else if (typeof emitter.removeListener === 'function') {
        emitter.removeListener(eventName, listener);
      }
    } catch (err) {
      // Safe recovery
    }
  }
  registeredListeners.length = 0;

  console.log('[Cleanup Manager] Memory leak sweep completed successfully.');
}

/**
 * Returns diagnostic memory usage metrics and active timers
 */
function getTelemetry() {
  const memory = process.memoryUsage();
  return {
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024 * 100) / 100,
    heapTotalMb: Math.round(memory.heapTotal / 1024 / 1024 * 100) / 100,
    rssMb: Math.round(memory.rss / 1024 / 1024 * 100) / 100,
    activeIntervals: registeredIntervals.size,
    activeTimeouts: registeredTimeouts.size,
    activeListenersCount: registeredListeners.length,
  };
}

module.exports = {
  registerInterval,
  deregisterInterval,
  registerTimeout,
  deregisterTimeout,
  registerListener,
  cleanupAll,
  getTelemetry
};
