// src/models/AiBudgetConfig.js
// Persistent configuration and tracking table for SRE-grade global spending caps

const mongoose = require('mongoose');

const aiBudgetConfigSchema = new mongoose.Schema({
  globalDailyLimitUsd: {
    type: Number,
    required: true,
    default: 50.00 // $50 daily hard cap
  },
  globalMonthlyLimitUsd: {
    type: Number,
    required: true,
    default: 1000.00 // $1000 monthly hard cap
  },
  emergencyShutdownActive: {
    type: Boolean,
    required: true,
    default: false // If true, all external LLM calls are disabled instantly
  },
  alertThresholdPercent: {
    type: Number,
    required: true,
    default: 80 // Alert SREs at 80% spending
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('AiBudgetConfig', aiBudgetConfigSchema);
