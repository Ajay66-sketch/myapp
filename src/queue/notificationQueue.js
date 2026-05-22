// src/queue/notificationQueue.js
const { Queue } = require('bullmq');

const connection = {
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379
};

const notificationQueue = new Queue('notifications', { connection });

// Function to schedule a comeback reminder
const scheduleComebackReminder = async (userId, username) => {
  // Try to remove existing delayed jobs for this user so they don't get spammed
  // (In BullMQ Pro we could use repeatable jobs with deduplication easily, for MVP we just add a delayed job)
  await notificationQueue.add('comeback_nudge', { userId, username }, {
    delay: 24 * 60 * 60 * 1000, // 24 hours from now
    jobId: `comeback-${userId}` // Unique jobId prevents duplicates
  });
};

module.exports = {
  notificationQueue,
  connection,
  scheduleComebackReminder
};
