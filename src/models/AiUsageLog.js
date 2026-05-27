// src/models/AiUsageLog.js
// Persistent audit table tracking SaaS AI completions, billing costs, and token quotas

const mongoose = require('mongoose');

const aiUsageLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  promptFingerprint: {
    type: String,
    required: true,
    index: true
  },
  modelUsed: {
    type: String,
    required: true
  },
  promptTokens: {
    type: Number,
    required: true,
    default: 0
  },
  completionTokens: {
    type: Number,
    required: true,
    default: 0
  },
  totalTokens: {
    type: Number,
    required: true,
    default: 0
  },
  estimatedCostUsd: {
    type: Number,
    required: true,
    default: 0
  },
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Compound index for high-speed monthly/daily usage aggregations
aiUsageLogSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AiUsageLog', aiUsageLogSchema);
