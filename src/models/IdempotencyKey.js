// src/models/IdempotencyKey.js
// Production-grade Mongoose schema for persistent distributed task idempotency

const mongoose = require('mongoose');

const idempotencyKeySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    status: {
      type: String,
      enum: ['processing', 'done'],
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now,
      expires: 86400 // TTL of 24 hours (in seconds)
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('IdempotencyKey', idempotencyKeySchema);
