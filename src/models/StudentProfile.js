// src/models/StudentProfile.js
const mongoose = require('mongoose');

const studentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    overallConfidenceScore: {
      type: Number,
      default: 3.0 // 1-5 scale
    },
    weakTopics: [
      {
        topic: {
          type: String,
          required: true
        },
        confidence: {
          type: Number,
          default: 1.0 // 1-5 scale
        },
        timesFailed: {
          type: Number,
          default: 0
        },
        lastAttemptDate: {
          type: Date,
          default: Date.now
        }
      }
    ],
    masteredTopics: {
      type: [String],
      default: []
    },
    burnoutMetrics: {
      streakCount: {
        type: Number,
        default: 0
      },
      lastActiveDate: {
        type: Date
      },
      consecutiveFailures: {
        type: Number,
        default: 0
      },
      burnoutFlag: {
        type: Boolean,
        default: false
      }
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('StudentProfile', studentProfileSchema);
