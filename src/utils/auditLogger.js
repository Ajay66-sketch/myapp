// src/utils/auditLogger.js
// Centralized structured logging for monetization events and route protection

const logger = require('../telemetry/logger');

/**
 * Log structured audit and security events.
 * 
 * @param {object} params - Log parameters
 * @param {string} params.action - The log action (e.g. 'upgrade_requested', 'downgrade_requested', 'tier_changed', 'feature_access_denied', 'admin_route_access')
 * @param {string} params.userId - ID of the user performing or targeted by the action
 * @param {string} [params.previousTier] - Previous subscription tier of the user
 * @param {string} [params.nextTier] - New subscription tier of the user
 * @param {string} [params.resource] - The resource / API endpoint being requested
 * @param {boolean} [params.success=true] - Status of the action
 * @param {object} [params.metadata={}] - Additional context properties
 */
function logAuditEvent({
  action,
  userId,
  previousTier,
  nextTier,
  resource,
  success = true,
  metadata = {},
}) {
  try {
    const safeMetadata = { ...metadata };
    
    // Ensure credentials or secrets are NEVER exposed in logs
    const secretKeys = ['token', 'password', 'secret', 'accessToken', 'refreshToken', 'credential'];
    for (const key of secretKeys) {
      if (key in safeMetadata) delete safeMetadata[key];
    }

    const logEntry = {
      event: 'audit_log',
      action,
      userId: userId || 'anonymous',
      previousTier: previousTier || null,
      nextTier: nextTier || null,
      resource: resource || null,
      success,
      metadata: safeMetadata,
    };

    logger.info(`[AUDIT] ${action}`, logEntry, 'audit');
    return logEntry;
  } catch (error) {
    console.error('Failed to write structured audit log:', error);
    return null;
  }
}

module.exports = {
  logAuditEvent,
};

