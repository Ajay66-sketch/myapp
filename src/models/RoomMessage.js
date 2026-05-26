// src/models/RoomMessage.js
// Mongoose schema and model for persistent room chat messages

const mongoose = require('mongoose');

const roomMessageSchema = new mongoose.Schema(
  {
    roomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Room',
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: [true, 'Message content cannot be empty'],
      trim: true,
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    type: {
      type: String,
      enum: ['chat', 'system'],
      default: 'chat',
    },
    deliveredTo: {
      type: [String],
      default: [],
    },
    seenBy: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Only record createdAt, no updatedAt required
  }
);

// Compound index on roomId and createdAt for fast chronological conversation querying
roomMessageSchema.index({ roomId: 1, createdAt: 1 });

module.exports = mongoose.model('RoomMessage', roomMessageSchema);
