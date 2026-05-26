// src/queue/telemetryQueue.js
// Asynchronously processes system telemetry event logs

const ResilientQueue = require('./baseQueue');
const systemEventBus = require('../telemetry/eventBus');
const { logAuditEvent } = require('../utils/auditLogger');

const telemetryQueue = new ResilientQueue('telemetry-logs', async (jobData) => {
  const { action, userId, resource, success, metadata } = jobData;
  
  // 1. Write audit log entry
  logAuditEvent({ action, userId, resource, success, metadata });

  // 2. Stream telemetry event on bus
  systemEventBus.emit(action, success ? 'info' : 'warn', metadata, userId);
});

module.exports = telemetryQueue;
