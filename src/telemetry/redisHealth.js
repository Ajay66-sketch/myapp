// src/telemetry/redisHealth.js
// Active periodic Redis pinger and connection health manager

const eventBus = require('./eventBus');
let checkInterval = null;
let currentStatus = 'healthy'; // healthy | degraded | down

/**
 * Start periodic Redis latency checks
 */
function startRedisHealthMonitor(intervalMs = 5000) {
  if (checkInterval) clearInterval(checkInterval);

  checkInterval = setInterval(async () => {
    const { getRedisClient } = require('../config/redisClient');
    const redisClient = getRedisClient();

    if (!redisClient) {
      updateStatus('down', { error: 'Redis client not initialized' });
      return;
    }

    if (redisClient.status !== 'ready') {
      updateStatus('down', { status: redisClient.status });
      return;
    }

    const start = Date.now();
    try {
      await redisClient.ping();
      const latency = Date.now() - start;

      if (latency > 250) {
        updateStatus('degraded', { latency, error: 'High latency threshold exceeded' });
      } else {
        updateStatus('healthy', { latency });
      }
    } catch (err) {
      updateStatus('down', { error: err.message });
    }
  }, intervalMs);
}

/**
 * Handle health status changes
 */
function updateStatus(newStatus, meta) {
  if (newStatus !== currentStatus) {
    currentStatus = newStatus;
    const severity = newStatus === 'healthy' ? 'info' : (newStatus === 'degraded' ? 'warn' : 'error');
    eventBus.emit(`redis:${newStatus}`, severity, meta);
  }
}

/**
 * Fetch current Redis health status
 */
function getRedisStatus() {
  return currentStatus;
}

module.exports = {
  startRedisHealthMonitor,
  getRedisStatus
};
