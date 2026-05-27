// src/models/Textbook.js
const mongoose = require('mongoose');

const textbookSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    title: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
    },
    fileKey: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['uploading', 'processing', 'processed', 'failed'],
      default: 'uploading',
      index: true
    },
    chunkCount: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Textbook', textbookSchema);
