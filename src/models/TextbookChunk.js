// src/models/TextbookChunk.js
const mongoose = require('mongoose');

const textbookChunkSchema = new mongoose.Schema({
  textbookId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Textbook',
    required: true,
    index: true
  },
  chunkIndex: {
    type: Number,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  embedding: {
    type: [Number],
    required: true
  }
});

// Compound index for fast lookup
textbookChunkSchema.index({ textbookId: 1, chunkIndex: 1 });

module.exports = mongoose.model('TextbookChunk', textbookChunkSchema);
