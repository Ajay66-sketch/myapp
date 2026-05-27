// src/models/DeadLetterJob.js
// Production-grade Mongoose schema for persistent dead letter queue (DLQ) auditing

const mongoose = require('mongoose');

const deadLetterJobSchema = new mongoose.Schema(
  {
    jobId: {
      type: String,
      required: true,
      index: true
    },
    queueName: {
      type: String,
      required: true,
      index: true
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    errorReason: {
      type: String,
      required: true
    },
    attemptsMade: {
      type: Number,
      default: 1
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('DeadLetterJob', deadLetterJobSchema);
