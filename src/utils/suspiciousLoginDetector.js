// src/utils/suspiciousLoginDetector.js
// Identifies impossible travel patterns (rapid logins from different IPs) and alerts telemetry systems.

const systemEventBus = require('../telemetry/eventBus');
const { logAuditEvent } = require('./auditLogger');
const { recordSuspiciousActivity } = require('../middleware/rateLimitSuspicious');
const logger = require('../telemetry/logger');

/**
 * Audit and detect suspicious logins based on user history, IP, and User-Agent.
 * @param {object} user The user object that just authenticated.
 * @param {object} req Express request object containing headers and client details.
 */
async function detectSuspiciousLogin(user, req) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const userIdStr = user._id.toString();

  // 1. Emit telemetry event for login attempt
  systemEventBus.emit('auth:login_attempt', 'info', {
    userId: userIdStr,
    ip,
    userAgent
  }, 'security');

  // 2. Fetch active sessions from Redis to check for IP discrepancies
  let getRedisClient;
  try {
    getRedisClient = require('../config/redisClient').getRedisClient;
  } catch (err) {
    return;
  }

  const redis = getRedisClient();
  if (redis && redis.status === 'ready') {
    try {
      const pattern = `session:refresh:${userIdStr}:*`;
      const keys = await redis.keys(pattern);

      if (keys.length > 0) {
        for (const key of keys) {
          const sessionDataStr = await redis.get(key);
          if (sessionDataStr) {
            const session = JSON.parse(sessionDataStr);

            // Anomaly condition: Login from different IP within a brief window (e.g. 60 seconds)
            if (session.ip && session.ip !== ip) {
              const timeDiffMs = Date.now() - session.lastUsed;
              if (timeDiffMs < 60000) { // under 60 seconds
                logger.warn(`[SuspiciousLogin] Impossible travel detected for user ${userIdStr}. Previous session: ${session.ip}, Current session: ${ip}`, {
                  userId: userIdStr,
                  originalIp: session.ip,
                  newIp: ip,
                  timeDiffMs
                });

                systemEventBus.emit('auth:suspicious_login', 'warn', {
                  userId: userIdStr,
                  originalIp: session.ip,
                  newIp: ip,
                  reason: 'impossible_travel'
                }, 'security');

                logAuditEvent({
                  action: 'auth_suspicious_login_detected',
                  userId: userIdStr,
                  success: false,
                  metadata: { originalIp: session.ip, newIp: ip, reason: 'impossible_travel' }
                });

                // Escalate IP security bounds
                await recordSuspiciousActivity(ip);
                await recordSuspiciousActivity(session.ip);
              }
            }
          }
        }
      }
    } catch (err) {
      logger.error('Failed to run suspicious login detection check:', { error: err.message });
    }
  }
}

module.exports = { detectSuspiciousLogin };
