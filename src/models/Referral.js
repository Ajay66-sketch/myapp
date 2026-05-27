// src/models/Referral.js
// Persistent viral loops and dual-sided reward auditing records

const mongoose = require('mongoose');

const referralSchema = new mongoose.Schema({
  referrerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  referredUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true
  },
  referralCodeUsed: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['signed_up', 'upgraded', 'rewarded'],
    default: 'signed_up'
  },
  rewardTokensAwarded: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Referral', referralSchema);
