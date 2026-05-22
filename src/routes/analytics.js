// src/routes/analytics.js
const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analytics');

router.post('/batch', analyticsController.processBatch);
router.get('/dashboard', analyticsController.getDashboardMetrics);

module.exports = router;
