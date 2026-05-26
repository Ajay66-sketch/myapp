// src/metrics/metricsCollector.js
// Production Observability: Captures runtime diagnostics, timer drifts, memory snapshots, and db latency profiles

const systemEventBus = require('../telemetry/eventBus');
const cleanupManager = require('../core/cleanupManager');

let ioInstance = null;

// Registry of atomic runtime counts and latency readings
const runtimeMetrics = {
  socketLatencyMs: [],
  redisLatencyMs: [],
  queueLatencyMs: [],
  timerDriftSec: [],
  reconnectCounts: 0,
  duplicateEventDetections: 0,
  activeLocksCount: 0
};

// Start background collection sweep interval (every 10 seconds)
const metricsIntervalId = setInterval(() => {
  publishMetricsSnapshot();
}, 10000);

cleanupManager.registerInterval(metricsIntervalId);

/**
 * Configure metrics collector with the active Socket.io instance
 * @param {object} io 
 */
function setIoInstance(io) {
  ioInstance = io;
}

/**
 * Records socket transaction delay
 */
function recordSocketLatency(ms) {
  runtimeMetrics.socketLatencyMs.push(ms);
  if (runtimeMetrics.socketLatencyMs.length > 100) runtimeMetrics.socketLatencyMs.shift();
}

/**
 * Records database or cache query duration
 */
function recordRedisLatency(ms) {
  runtimeMetrics.redisLatencyMs.push(ms);
  if (runtimeMetrics.redisLatencyMs.length > 100) runtimeMetrics.redisLatencyMs.shift();
}

/**
 * Records queue message processing duration
 */
function recordQueueLatency(ms) {
  runtimeMetrics.queueLatencyMs.push(ms);
  if (runtimeMetrics.queueLatencyMs.length > 100) runtimeMetrics.queueLatencyMs.shift();
}

/**
 * Records calculated countdown sync offsets
 */
function recordTimerDrift(sec) {
  runtimeMetrics.timerDriftSec.push(sec);
  if (runtimeMetrics.timerDriftSec.length > 100) runtimeMetrics.timerDriftSec.shift();
}

/**
 * Increments socket reconnection attempts
 */
function recordReconnect() {
  runtimeMetrics.reconnectCounts++;
}

/**
 * Increments duplicate event trigger attempts (e.g. idempotent bypass guards)
 */
function recordDuplicateEvent() {
  runtimeMetrics.duplicateEventDetections++;
}

/**
 * Computes average value of an array safely
 */
function getAverage(arr) {
  if (arr.length === 0) return 0;
  const sum = arr.reduce((a, b) => a + b, 0);
  return Math.round((sum / arr.length) * 100) / 100;
}

/**
 * Generate a comprehensive system state snapshot
 */
function generateSnapshot() {
  const memoryStats = cleanupManager.getTelemetry();
  const presenceService = require('../socket/presence/presenceService');

  // Track active locks count safely
  let activeLocks = 0;
  try {
    const { localMemoryLocks } = require('../core/distributedLock');
    activeLocks = localMemoryLocks.size;
  } catch (e) {}

  return {
    timestamp: Date.now(),
    memory: {
      heapUsedMb: memoryStats.heapUsedMb,
      heapTotalMb: memoryStats.heapTotalMb,
      rssMb: memoryStats.rssMb,
    },
    timers: {
      activeIntervals: memoryStats.activeIntervals,
      activeTimeouts: memoryStats.activeTimeouts,
      activeListeners: memoryStats.activeListenersCount,
      activeRooms: presenceService.roomsState.size,
      averageDriftSeconds: getAverage(runtimeMetrics.timerDriftSec)
    },
    performance: {
      averageSocketLatencyMs: getAverage(runtimeMetrics.socketLatencyMs),
      averageRedisLatencyMs: getAverage(runtimeMetrics.redisLatencyMs),
      averageQueueLatencyMs: getAverage(runtimeMetrics.queueLatencyMs),
    },
    counters: {
      reconnectCount: runtimeMetrics.reconnectCounts,
      duplicateEventDetections: runtimeMetrics.duplicateEventDetections,
      activeLocks,
    }
  };
}

/**
 * Broadcast metrics snapshot to administrators
 */
function publishMetricsSnapshot() {
  const snapshot = generateSnapshot();

  // 1. Emit to system telemetry bus
  systemEventBus.emit('metrics:snapshot', 'info', snapshot, 'system');

  // 2. Stream directly to admin socket room
  if (ioInstance) {
    ioInstance.to('admin:telemetry').emit('admin:metrics:update', snapshot);
  }
}

module.exports = {
  setIoInstance,
  recordSocketLatency,
  recordRedisLatency,
  recordQueueLatency,
  recordTimerDrift,
  recordReconnect,
  recordDuplicateEvent,
  generateSnapshot,
  publishMetricsSnapshot
};
