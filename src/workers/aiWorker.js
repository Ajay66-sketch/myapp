// src/workers/aiWorker.js
// Dedicated background worker process to consume and process intensive AI Coach LLM tasks

const { aiQueue } = require('../queue/aiQueue');
const connectDB = require('../config/db');

// 1. Establish database connection in worker context
connectDB();

// 2. Instantiate and boot worker
const worker = aiQueue.createWorker({
  concurrency: process.env.AI_WORKER_CONCURRENCY ? parseInt(process.env.AI_WORKER_CONCURRENCY) : 2,
  timeoutMs: 90000 // 90s safety threshold for external LLM API processing
});

console.log('👷 [AI Coach Background Worker] Bootstrapped successfully. Awaiting jobs...');

module.exports = worker;
