// src/routes/index.js
// Centralized routing orchestrator — handles routing versioning under /api/v1 and legacy path mapping.

const express = require('express');
const router = express.Router();

const authRoutes = require('./auth');
const messageRoutes = require('./messages');
const userRoutes = require('./users');
const studyRoomRoutes = require('./studyRooms');
const focusSessionRoutes = require('./focusSessions');
const analyticsRoutes = require('./analytics');
const notificationRoutes = require('./notifications');
const billingRoutes = require('./billing');
const roomsRoutes = require('./rooms');
const { router: aiRoutes } = require('./ai');
const gamificationRoutes = require('./gamification');
const complianceRoutes = require('./compliance');
const adminMetricsRoutes = require('./adminMetrics');
const discordRoutes = require('./discord');
const socraticRoutes = require('./socratic');

// Setup rate limiter (same as defined in app.js)
const { rateLimitHandler } = require('../middleware/rateLimitBanning');
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  handler: rateLimitHandler,
  skip: (req) => {
    return (req.originalUrl && (req.originalUrl.includes('/webhook') || req.originalUrl.includes('/billing/webhook'))) ||
           (req.path && (req.path.includes('/webhook') || req.path.includes('/billing/webhook')));
  }
});

// ─── Versioned V1 Routing Pipeline ──────────────────────────────────────────
const v1Router = express.Router();

v1Router.use('/auth', authRoutes);
v1Router.use('/messages', messageRoutes);
v1Router.use('/users', userRoutes);
v1Router.use('/study-rooms', studyRoomRoutes);
v1Router.use('/focus-sessions', focusSessionRoutes);
v1Router.use('/analytics', analyticsRoutes);
v1Router.use('/notifications', notificationRoutes);
v1Router.use('/billing', billingRoutes);
v1Router.use('/rooms', roomsRoutes);
v1Router.use('/ai', aiRoutes);
v1Router.use('/gamification', gamificationRoutes);
v1Router.use('/compliance', complianceRoutes);
v1Router.use('/admin/billing', adminMetricsRoutes);
v1Router.use('/discord', discordRoutes);
v1Router.use('/socratic', socraticRoutes);

// Apply rate limiter specifically to /api/v1 routes
router.use('/api/v1', apiLimiter, v1Router);

// ─── Legacy Backward Compatibility Routing (Aliases) ─────────────────────────
router.use('/auth', authRoutes);
router.use('/notifications', notificationRoutes);
router.use('/billing', billingRoutes);
router.use('/rooms', roomsRoutes);
router.use('/ai', aiRoutes);
router.use('/gamification', gamificationRoutes);
router.use('/socratic', socraticRoutes);

module.exports = router;
