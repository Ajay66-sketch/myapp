// src/routes/notifications.js
// Express API router for secure notifications management

const express = require('express');
const { protect } = require('../middleware/auth');
const notificationService = require('../services/notificationService');

const router = express.Router();

// Enforce token-based protection for all notification endpoints
router.use(protect);

/**
 * GET /api/v1/notifications
 * Retrieves chronological notifications list and includes unread counts
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { notifications, unreadCount } = await notificationService.getNotifications(userId);
    
    return res.status(200).json({
      status: 'success',
      data: notifications,
      unreadCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/notifications/read
 * Marks a single notification as read using body payload { notificationId }
 */
router.post('/read', async (req, res, next) => {
  try {
    const { notificationId } = req.body;
    if (!notificationId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Notification ID is required in body payload to mark as read',
      });
    }

    const notification = await notificationService.markAsRead(notificationId, req.user._id);
    if (!notification) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Notification not found or access denied',
      });
    }

    return res.status(200).json({
      status: 'success',
      data: notification,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/notifications/read-all
 * Marks all unread notifications of the user as read
 */
router.post('/read-all', async (req, res, next) => {
  try {
    await notificationService.markAllAsRead(req.user._id);
    
    return res.status(200).json({
      status: 'success',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
