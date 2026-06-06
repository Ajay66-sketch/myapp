// src/models/AuditLog.js
// Tamper-proof, high-fidelity audit trail logging critical security and subscription state changes

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  }, // e.g. "razorpay_upgrade_succeeded", "dunning_grace_period_enforced", "gdpr_erase"
  performedBy: {
    type: String,
    required: true,
    default: 'system' // e.g. "system", "razorpay_webhook", "admin_user_id"
  },
  ipAddress: {
    type: String,
    default: ''
  },
  userAgent: {
    type: String,
    default: ''
  },
  success: {
    type: Boolean,
    required: true,
    default: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
});

//Compound index for high-speed date range compliance reporting
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
