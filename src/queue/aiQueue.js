// src/queue/aiQueue.js
const { Queue } = require('bullmq');

const hasRedis = Boolean(
  process.env.REDIS_URL || process.env.REDIS_HOST || process.env.REDIS_PORT
);

const connection = hasRedis
  ? {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    }
  : null;

const noopQueue = {
  add: async (name, data, options) => {
    console.log(
      `[Queue] Redis is not configured. Skipping job enqueue: ${name}`
    );
    return Promise.resolve(null);
  },
};

const aiQueue = hasRedis ? new Queue('ai-coach', { connection }) : noopQueue;

module.exports = {
  aiQueue,
  connection,
};
