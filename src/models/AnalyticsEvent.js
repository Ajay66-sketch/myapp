// src/models/AnalyticsEvent.js
// Mongoose schema for tracking atomic events

const mongoose = require('mongoose');

const analyticsEventSchema = new mongoose.Schema({
  eventName: {
    type: String,
    required: true,
    index: true // Indexed for faster aggregation
  },
  userId: {
    type: String, // Can be user ID, or anonymous session identifier
    index: true
  },
  sessionId: {
    type: String,
    required: true,
    index: true
  },
  properties: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

module.exports = mongoose.model('AnalyticsEvent', analyticsEventSchema);
