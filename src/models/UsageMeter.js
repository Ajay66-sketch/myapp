// src/models/UsageMeter.js
// High-performance tracking table for SaaS consumption metering and overage limitations

const mongoose = require('mongoose');

const usageMeterSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  featureName: {
    type: String,
    required: true
  }, // e.g. "ai_tokens", "room_summaries", "study_rooms"
  metricValue: {
    type: Number,
    required: true,
    default: 0
  },
  billingPeriodStart: {
    type: Date,
    required: true
  },
  billingPeriodEnd: {
    type: Date,
    required: true
  }
});

// High-speed compound queries for current active billing cycle usage metering
usageMeterSchema.index({ userId: 1, featureName: 1, billingPeriodStart: -1 });

module.exports = mongoose.model('UsageMeter', usageMeterSchema);
