// src/controllers/notifications.js
const Notification = require('../models/Notification');
const mongoose = require('mongoose');

// GET /api/v1/notifications
// Fetch recent notifications for a user
exports.getNotifications = async (req, res) => {
  try {
    const userId = req.headers['x-user-id']; // For demo, we pass it via headers
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(200).json({ status: 'success', data: [] });
    }

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50);

    res.status(200).json({ status: 'success', data: notifications });
  } catch (error) {
    console.error('Fetch notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
};

// PATCH /api/v1/notifications/read-all
// Mark all notifications as read
exports.markAllAsRead = async (req, res) => {
  try {
    const userId = req.headers['x-user-id'];
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    if (mongoose.connection.readyState === 1) {
      await Notification.updateMany(
        { userId, isRead: false },
        { $set: { isRead: true } }
      );
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    console.error('Mark read error:', error);
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
};
