// src/models/Room.js
// Mongoose schema and model for Chat Rooms

const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Room name is required'],
      trim: true,
      maxlength: [50, 'Room name cannot exceed 50 characters'],
    },
    slug: {
      type: String,
      required: [true, 'Room slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9-_]+$/, 'Please provide a valid slug (only lowercase letters, numbers, dashes, and underscores)'],
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tierRequired: {
      type: String,
      enum: ['free', 'pro', 'admin'],
      default: 'free',
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Add unique index on slug for fast lookup and strict uniqueness
roomSchema.index({ slug: 1 });

module.exports = mongoose.model('Room', roomSchema);
