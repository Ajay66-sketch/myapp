// src/models/AcademicProfile.js
const mongoose = require('mongoose');

const academicProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    primarySubjects: {
      type: [String],
      default: []
    },
    longTermGoals: {
      type: String,
      default: ''
    },
    studyStyle: {
      type: String,
      default: 'Visual & Interactive'
    },
    activeContext: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('AcademicProfile', academicProfileSchema);
