// src/models/StudySession.js
const mongoose = require('mongoose');

const studySessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    subject: {
      type: String,
      required: true,
      index: true
    },
    startTime: {
      type: Date,
      default: Date.now
    },
    endTime: {
      type: Date
    },
    durationMinutes: {
      type: Number,
      default: 0
    },
    performanceMetrics: {
      totalQuestions: {
        type: Number,
        default: 0
      },
      correctAnswers: {
        type: Number,
        default: 0
      },
      averageConfidence: {
        type: Number,
        default: 0
      }
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'abandoned'],
      default: 'active'
    },
    interactionLogs: [
      {
        timestamp: {
          type: Date,
          default: Date.now
        },
        role: {
          type: String,
          enum: ['user', 'tutor'],
          required: true
        },
        text: {
          type: String,
          required: true
        },
        confusionLevel: {
          type: Number,
          default: 0 // scale of 0 to 5
        }
      }
    ]
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('StudySession', studySessionSchema);
