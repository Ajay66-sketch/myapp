// src/queue/notificationQueue.js
// Asynchronously processes system study notifications

const ResilientQueue = require('./baseQueue');
const notificationService = require('../services/notificationService');

const notificationQueue = new ResilientQueue('system-notifications', async (jobData) => {
  await notificationService.createNotification(jobData);
});

module.exports = notificationQueue;
