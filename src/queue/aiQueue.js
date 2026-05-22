// src/queue/aiQueue.js
const { Queue } = require('bullmq');

// Initialize BullMQ Queue
// Requires Redis connection
const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
};

const aiQueue = new Queue('ai-coach', { connection });

module.exports = {
  aiQueue,
  connection
};
