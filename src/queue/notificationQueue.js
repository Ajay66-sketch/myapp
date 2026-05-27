// src/queue/notificationQueue.js
// Asynchronously processes system study notifications, leaderboard alerts, and user comeback nudges

const ResilientQueue = require('./baseQueue');
const notificationService = require('../services/notificationService');
const Notification = require('../models/Notification');
const mongoose = require('mongoose');
const emailService = require('../services/emailService');

// Lazy getter for Socket.IO connection
const getIO = () => {
  try {
    return require('../socket').getIO();
  } catch (err) {
    return null;
  }
};

/**
 * Handles all notification-related background tasks, including user comeback notifications.
 */
async function processNotificationJob(jobData) {
  // Support for transactional email dispatches
  if (jobData.jobName === 'send_email' || jobData.type === 'email') {
    const { emailType, recipientEmail, username, metadata } = jobData;
    if (!recipientEmail || !emailType) {
      throw new Error('Cannot process transactional email: Missing emailType or recipientEmail');
    }
    return emailService.sendTransactionalEmail({
      emailType,
      recipientEmail,
      username: username || 'Learner',
      metadata: metadata || {}
    });
  }

  // Support for comeback_nudge background alerts
  if (jobData.jobName === 'comeback_nudge' || jobData.type === 'comeback') {
    const { userId, username } = jobData;
    if (!userId) throw new Error('Cannot process comeback notification: Missing userId');

    const title = 'We miss your focus!';
    const message = `Hey ${username || 'Learner'}, it's been a day since your last session. Keep your streak alive!`;
    const type = 'comeback';

    // Persist notification to database if available
    let notification = null;
    if (mongoose.connection.readyState === 1) {
      notification = await Notification.create({
        userId,
        type,
        title,
        message
      });
    } else {
      notification = { 
        _id: Date.now().toString(), 
        userId,
        type, 
        title, 
        message, 
        isRead: false, 
        createdAt: new Date() 
      };
    }

    // Try to broadcast the notification via real-time WebSocket connection
    try {
      const io = getIO();
      if (io) {
        io.to(`user:${userId}`).emit('notification:received', notification);
      }
    } catch (err) {
      console.warn('[Notification Processor] WebSocket notification broadcast skipped:', err.message);
    }

    return notification;
  }

  // Handle generic system notifications
  console.log(`✉️ [Notification Processor] Processing system notification for user: ${jobData.userId}`);
  return notificationService.createNotification(jobData);
}

const notificationQueue = new ResilientQueue('system-notifications', processNotificationJob, {
  maxRetries: 3,
  initialDelayMs: 3000
});

module.exports = notificationQueue;
