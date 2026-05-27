// src/models/FeatureFlag.js
// Central dynamic Feature Flag and entitlement management table

const mongoose = require('mongoose');

const featureFlagSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  }, // e.g. "ai_chat_enabled", "room_summaries_enabled"
  description: {
    type: String,
    default: ''
  },
  isActiveGlobally: {
    type: Boolean,
    required: true,
    default: true
  },
  allowedTiers: [{
    type: String,
    enum: ['free', 'pro', 'admin'],
    default: ['pro', 'admin']
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('FeatureFlag', featureFlagSchema);
