// src/services/notificationService.js
// Centralized notification service supporting MongoDB persistence, in-memory fallbacks, and Socket.IO pushes

const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const { logAuditEvent } = require('../utils/auditLogger');

// In-memory notifications fallback registry
const inMemoryNotifications = [];

// Socket.IO instance placeholder
let ioInstance = null;

/**
 * Check if the MongoDB service is active and connected.
 * 
 * @returns {boolean} True if MongoDB is online
 */
function isDbAvailable() {
  return mongoose.connection.readyState === 1;
}

/**
 * Register the global Socket.IO server instance.
 * 
 * @param {object} io - Socket.IO server instance
 */
function setIoInstance(io) {
  ioInstance = io;
  console.log('[Notification Service] Socket.IO instance successfully registered.');
}

/**
 * Send a realtime socket event to a specific user if they are connected.
 * 
 * @param {string} userId - Target user identifier
 * @param {string} event - Event name
 * @param {object} payload - Message payload
 */
function emitRealtimeEvent(userId, event, payload) {
  if (ioInstance && userId) {
    const userStr = userId.toString();
    ioInstance.to(userStr).emit(event, payload);
  }
}

/**
 * Create a new notification. If DB is offline, falls back to memory.
 * 
 * @param {object} param0 - Notification configurations
 * @returns {Promise<object>} Created notification object
 */
async function createNotification({ userId, type, title, message, link = null }) {
  if (!userId) {
    throw new Error('User ID is required to create a notification');
  }

  const notificationData = {
    userId: userId.toString(),
    type,
    title,
    message,
    link,
    isRead: false,
  };

  let notification = null;

  try {
    if (isDbAvailable()) {
      // MongoDB Persistence
      const dbNotification = await Notification.create(notificationData);
      notification = dbNotification.toObject ? dbNotification.toObject() : dbNotification;
    } else {
      // In-Memory Fallback
      notification = {
        _id: new mongoose.Types.ObjectId().toString(),
        ...notificationData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      inMemoryNotifications.push(notification);
    }

    // Log structured audit trail
    logAuditEvent({
      action: 'notification_created',
      userId,
      resource: `notification:${notification._id}`,
      success: true,
      metadata: { type, title },
    });

    // Realtime notification socket push
    emitRealtimeEvent(userId, 'notification:new', notification);
    
    // Log delivered audit event
    logAuditEvent({
      action: 'notification_delivered',
      userId,
      resource: `notification:${notification._id}`,
      success: true,
      metadata: { type },
    });

    return notification;
  } catch (error) {
    console.error('[Notification Service] Failed to create notification:', error);
    throw error;
  }
}

/**
 * Retrieve notifications list and unread count for a user.
 * 
 * @param {string|object} userId - User ID
 * @returns {Promise<object>} Struct containing notifications array and unread count
 */
async function getNotifications(userId) {
  if (!userId) return { notifications: [], unreadCount: 0 };
  const userStr = userId.toString();

  try {
    let notifications = [];
    let unreadCount = 0;

    if (isDbAvailable()) {
      notifications = await Notification.find({ userId: userStr })
        .sort({ createdAt: -1 })
        .limit(50);
      
      unreadCount = await Notification.countDocuments({ userId: userStr, isRead: false });
    } else {
      const filtered = inMemoryNotifications.filter((n) => n.userId === userStr);
      notifications = [...filtered]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50);
      
      unreadCount = filtered.filter((n) => !n.isRead).length;
    }

    return {
      notifications,
      unreadCount,
    };
  } catch (error) {
    console.error('[Notification Service] Failed to load notifications:', error);
    return { notifications: [], unreadCount: 0 };
  }
}

/**
 * Mark a specific notification as read.
 * 
 * @param {string} notificationId - Notification ID
 * @param {string} userId - User ID who owns the notification
 * @returns {Promise<object|null>} The updated notification
 */
async function markAsRead(notificationId, userId) {
  if (!notificationId || !userId) return null;
  const userStr = userId.toString();
  const notifyStr = notificationId.toString();

  try {
    let notification = null;

    if (isDbAvailable()) {
      const dbNotification = await Notification.findOneAndUpdate(
        { _id: notifyStr, userId: userStr },
        { $set: { isRead: true } },
        { new: true }
      );
      notification = dbNotification ? dbNotification.toObject() : null;
    } else {
      const index = inMemoryNotifications.findIndex((n) => n._id === notifyStr && n.userId === userStr);
      if (index !== -1) {
        inMemoryNotifications[index].isRead = true;
        inMemoryNotifications[index].updatedAt = new Date();
        notification = inMemoryNotifications[index];
      }
    }

    if (notification) {
      // Audit log notification read
      logAuditEvent({
        action: 'notification_read',
        userId,
        resource: `notification:${notifyStr}`,
        success: true,
      });

      // Realtime read receipt update over socket
      emitRealtimeEvent(userId, 'notification:read', { notificationId: notifyStr });
    }

    return notification;
  } catch (error) {
    console.error('[Notification Service] Failed to read notification:', error);
    return null;
  }
}

/**
 * Mark all unread notifications of a user as read.
 * 
 * @param {string} userId - User ID
 * @returns {Promise<boolean>} True on success
 */
async function markAllAsRead(userId) {
  if (!userId) return false;
  const userStr = userId.toString();

  try {
    if (isDbAvailable()) {
      await Notification.updateMany(
        { userId: userStr, isRead: false },
        { $set: { isRead: true } }
      );
    } else {
      inMemoryNotifications.forEach((n) => {
        if (n.userId === userStr && !n.isRead) {
          n.isRead = true;
          n.updatedAt = new Date();
        }
      });
    }

    // Audit log
    logAuditEvent({
      action: 'notification_read',
      userId,
      resource: 'notifications:all',
      success: true,
    });

    // Realtime notification socket refresh
    emitRealtimeEvent(userId, 'notification:read', { all: true });

    return true;
  } catch (error) {
    console.error('[Notification Service] Failed to clear notifications read status:', error);
    return false;
  }
}

/**
 * Retrieve unread notifications count for a user.
 * 
 * @param {string} userId - User ID
 * @returns {Promise<number>} Unread count
 */
async function getUnreadCount(userId) {
  if (!userId) return 0;
  const userStr = userId.toString();

  try {
    if (isDbAvailable()) {
      return await Notification.countDocuments({ userId: userStr, isRead: false });
    } else {
      return inMemoryNotifications.filter((n) => n.userId === userStr && !n.isRead).length;
    }
  } catch (error) {
    return 0;
  }
}

// Clear registry helper (for test runs)
function clearInMemoryNotifications() {
  inMemoryNotifications.length = 0;
}

module.exports = {
  setIoInstance,
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  clearInMemoryNotifications,
};
