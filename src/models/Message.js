// src/models/Message.js
// Mongoose schema and model for Messages

const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    // The user who sent the message
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // The user who receives the message
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Message content
    content: {
      type: String,
      required: [true, 'Message content cannot be empty'],
      trim: true,
      maxlength: [2000, 'Message cannot exceed 2000 characters'],
    },
    // Whether the receiver has read the message
    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// ─── Index for faster queries ─────────────────────────────────────────────────
// Commonly we fetch all messages between two users, so index both fields
messageSchema.index({ sender: 1, receiver: 1 });
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
