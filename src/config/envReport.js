// src/config/envReport.js
// Backward-compatible wrapper for SRE pre-boot environment validation
// Delegate directly to centralized configuration inside env.js

const { runPreBootAudit } = require('./env');

module.exports = {
  runPreBootAudit,
};
