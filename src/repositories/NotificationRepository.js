// src/repositories/NotificationRepository.js
// Abstracts system push alerts and in-app notifications persistence with telemetry and fallbacks

const notificationService = require('../services/notificationService');
const systemEventBus = require('../telemetry/eventBus');

/**
 * Persist new notification
 */
async function create(notificationData) {
  try {
    const notification = await notificationService.createNotification(notificationData);
    systemEventBus.emit('repository:write', 'info', { repository: 'NotificationRepository', operation: 'create', userId: notificationData.userId }, 'system');
    return notification;
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'NotificationRepository', operation: 'create', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Retrieve notifications for a user
 */
async function getNotifications(userId, limit = 50) {
  try {
    const result = await notificationService.getNotifications(userId, limit);
    systemEventBus.emit('repository:hit', 'info', { repository: 'NotificationRepository', operation: 'getNotifications', userId }, 'system');
    return result;
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'NotificationRepository', operation: 'getNotifications', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Get unread notifications count
 */
async function getUnreadCount(userId) {
  try {
    const count = await notificationService.getUnreadCount(userId);
    systemEventBus.emit('repository:hit', 'info', { repository: 'NotificationRepository', operation: 'getUnreadCount', userId }, 'system');
    return count;
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'NotificationRepository', operation: 'getUnreadCount', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Mark a specific notification as read
 */
async function markAsRead(notificationId, userId) {
  try {
    const notification = await notificationService.markAsRead(notificationId, userId);
    systemEventBus.emit('repository:write', 'info', { repository: 'NotificationRepository', operation: 'markAsRead', notificationId, userId }, 'system');
    return notification;
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'NotificationRepository', operation: 'markAsRead', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Mark all notifications as read for a user
 */
async function markAllAsRead(userId) {
  try {
    const result = await notificationService.markAllAsRead(userId);
    systemEventBus.emit('repository:write', 'info', { repository: 'NotificationRepository', operation: 'markAllAsRead', userId }, 'system');
    return result;
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'NotificationRepository', operation: 'markAllAsRead', error: err.message }, 'system');
    throw err;
  }
}

module.exports = {
  create,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead
};
