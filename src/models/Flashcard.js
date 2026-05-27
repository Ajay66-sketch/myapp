// src/models/Flashcard.js
const mongoose = require('mongoose');

const flashcardSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    front: {
      type: String,
      required: true
    },
    back: {
      type: String,
      required: true
    },
    subject: {
      type: String,
      required: true,
      index: true
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      default: 'medium'
    },
    sm2: {
      repetitions: {
        type: Number,
        default: 0
      },
      interval: {
        type: Number,
        default: 1 // in days
      },
      easinessFactor: {
        type: Number,
        default: 2.5
      },
      nextReviewDate: {
        type: Date,
        default: Date.now,
        index: true
      },
      lastReviewedDate: {
        type: Date
      }
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Flashcard', flashcardSchema);
