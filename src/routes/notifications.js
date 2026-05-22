// src/routes/notifications.js
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notifications');

router.get('/', notificationController.getNotifications);
router.patch('/read-all', notificationController.markAllAsRead);

module.exports = router;
