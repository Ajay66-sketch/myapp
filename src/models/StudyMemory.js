// src/models/StudyMemory.js
const mongoose = require('mongoose');

const studyMemorySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    recentTopics: {
      type: [String],
      default: []
    },
    keyConcepts: {
      type: [String],
      default: []
    },
    lastActiveTime: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('StudyMemory', studyMemorySchema);
