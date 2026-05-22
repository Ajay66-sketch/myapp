// src/workers/notificationWorker.js
const { Worker } = require('bullmq');
const { connection } = require('../queue/notificationQueue');
const Notification = require('../models/Notification');
const { getIO } = require('../socket');
const mongoose = require('mongoose');

const notificationWorker = new Worker('notifications', async (job) => {
  if (job.name === 'comeback_nudge') {
    const { userId, username } = job.data;
    
    // Check if user is already online to avoid sending a comeback notification while they are active
    // For MVP, we'll just insert the notification and push it to socket if they somehow connect immediately
    const title = 'We miss your focus!';
    const message = `Hey ${username}, it's been a day since your last session. Keep your streak alive!`;
    const type = 'comeback';

    // Save to DB
    let notification = null;
    if (mongoose.connection.readyState === 1) {
      notification = await Notification.create({
        userId,
        type,
        title,
        message
      });
    } else {
      notification = { _id: Date.now().toString(), type, title, message, isRead: false, createdAt: new Date() };
    }

    // Try to emit via Socket.io if they are online
    try {
      const io = getIO();
      // We would emit to the user's specific room:
      io.to(`user:${userId}`).emit('notification:received', notification);
    } catch (err) {
      // socket not ready or user offline
    }

    return notification;
  }
}, { connection });

notificationWorker.on('completed', (job) => {
  console.log(`[Notification Worker] Job ${job.id} completed successfully`);
});

notificationWorker.on('failed', (job, err) => {
  console.error(`[Notification Worker] Job ${job.id} failed:`, err.message);
});

module.exports = notificationWorker;
