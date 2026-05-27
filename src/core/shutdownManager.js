// src/core/shutdownManager.js
// Graceful Shutdown System: Orchestrates zero-downtime draining, db closures, and interval/lock cleanups

const cleanupManager = require('./cleanupManager');
const systemEventBus = require('../telemetry/eventBus');
const mongoose = require('mongoose');

let isShuttingDown = false;

const getIO = () => {
  try {
    return require('../socket').getIO();
  } catch (e) {
    return null;
  }
};

const getRedisClient = () => {
  try {
    return require('../socket').getRedisClient();
  } catch (e) {
    return null;
  }
};

/**
 * Perform a clean, graceful shutdown of all platform background services
 */
async function initiateGracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🚨 [Shutdown Manager] Received signal ${signal}. Initiating graceful shutdown sequence...`);
  systemEventBus.emit('system:shutdown_initiated', 'warn', { signal }, 'system');

  try {
    // 1. Stop Socket.io from accepting new connections
    const io = getIO();
    if (io) {
      console.log('   [1/6] Closing Socket.io server channels...');
      io.close(() => {
        console.log('   ✔ Socket.io server closed.');
      });
    }

    // 2. Shut down background distributed queues
    console.log('   [2/6] Closing and draining background queues...');
    try {
      const aiTutorQueue = require('../queue/aiTutorQueue');
      const notificationQueue = require('../queue/notificationQueue');
      const telemetryQueue = require('../queue/telemetryQueue');
      const analyticsQueue = require('../queue/analyticsQueue');
      const { aiQueue } = require('../queue/aiQueue');
      
      await Promise.all([
        aiTutorQueue.close(),
        notificationQueue.close(),
        telemetryQueue.close(),
        analyticsQueue.close(),
        aiQueue.close()
      ]);
      console.log('   ✔ All queue handlers successfully drained and closed.');
    } catch (err) {
      console.warn('   ⚠️ Queue draining failed.', err.message);
    }

    // 3. Clear all active locks
    console.log('   [3/6] Clearing active distributed locks...');
    try {
      const { localMemoryLocks } = require('./distributedLock');
      localMemoryLocks.clear();
      console.log('   ✔ Local memory locks cleared.');
    } catch (err) {}

    // 4. Cleanup all intervals, timeouts, and listeners
    console.log('   [4/6] Sweeping memory intervals and bindings...');
    cleanupManager.cleanupAll();

    // 5. Safely close database connections (Redis & Mongo)
    console.log('   [5/6] Closing database connections...');
    if (mongoose.connection && mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('   ✔ MongoDB connection closed.');
    }

    const redisClient = getRedisClient();
    if (redisClient) {
      await redisClient.quit();
      console.log('   ✔ Redis connection gracefully quit.');
    }

    console.log('   [6/6] Flushing remaining telemetry audit lines...');
    systemEventBus.emit('system:shutdown_success', 'info', { signal }, 'system');

    console.log('🎉 [Shutdown Manager] Graceful shutdown sequence completed. Exiting safely.\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ [Shutdown Manager] Graceful shutdown encountered errors:', error);
    process.exit(1);
  }
}

// Attach listeners for standard termination signals
process.on('SIGINT', () => initiateGracefulShutdown('SIGINT'));
process.on('SIGTERM', () => initiateGracefulShutdown('SIGTERM'));

module.exports = {
  initiateGracefulShutdown
};
