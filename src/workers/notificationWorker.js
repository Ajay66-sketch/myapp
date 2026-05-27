// src/workers/notificationWorker.js
// Dedicated background worker process to consume and process system notifications and comeback nudges

const notificationQueue = require('../queue/notificationQueue');
const connectDB = require('../config/db');

// 1. Establish database connection in worker context
connectDB();

// 2. Instantiate and boot worker
const worker = notificationQueue.createWorker({
  concurrency: process.env.NOTIFICATION_WORKER_CONCURRENCY ? parseInt(process.env.NOTIFICATION_WORKER_CONCURRENCY) : 5,
  timeoutMs: 15000 // 15s safety threshold for email/push processing
});

console.log('👷 [Notification Background Worker] Bootstrapped successfully. Awaiting jobs...');

module.exports = worker;
