// src/middleware/rateLimitBanning.js
// Enterprise-grade IP rate-limit violation tracking and automatic Redis-backed IP banning

const { logAuditEvent } = require('../utils/auditLogger');

/**
 * Handle rate limit violations, logging security context and enforcing sliding ban locks
 */
const rateLimitHandler = async (req, res, next, options) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  console.warn(`⚠️ [Security Alert] IP ${ip} exceeded API rate limit on route: ${req.originalUrl}`);

  logAuditEvent({
    action: 'rate_limit_violated',
    performedBy: 'system',
    ipAddress: ip,
    userAgent: req.headers['user-agent'],
    success: false,
    metadata: { route: req.originalUrl, limit: options.max }
  });

  let redisClient = null;
  try {
    const socketModule = require('../socket');
    redisClient = socketModule.getRedisClient();
  } catch (e) {}

  if (redisClient && redisClient.status === 'ready') {
    try {
      const banKey = `ip:banned:${ip}`;
      const violationKey = `ip:violations:${ip}`;

      const violations = await redisClient.incr(violationKey);
      if (violations === 1) {
        await redisClient.expire(violationKey, 3600); // 1-hour violations window
      }

      if (violations >= 3) {
        await redisClient.set(banKey, 'banned', 'EX', 86400); // Ban IP for 24 hours!
        console.error(`🛑 [Security Intervention] IP ${ip} temporarily banned for 24 hours due to persistent rate limit abuse.`);
        logAuditEvent({
          action: 'ip_banned',
          performedBy: 'system',
          ipAddress: ip,
          success: true,
          metadata: { reason: 'Persistent rate limit violations', violationsCount: violations }
        });
      }
    } catch (e) {
      console.warn('[Rate Limit Redis check failed]:', e.message);
    }
  }

  res.status(options.statusCode).json({
    error: 'TOO_MANY_REQUESTS',
    message: options.message || 'Too many requests, please try again later.'
  });
};

/**
 * Check if incoming connection IP is under an active Redis-backed ban lock
 */
const checkIpBan = async (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  let redisClient = null;
  try {
    const socketModule = require('../socket');
    redisClient = socketModule.getRedisClient();
  } catch (e) {}

  if (redisClient && redisClient.status === 'ready') {
    try {
      const isBanned = await redisClient.get(`ip:banned:${ip}`);
      if (isBanned) {
        console.warn(`🛑 [Access Denied] Banned IP attempted connection: ${ip}`);
        return res.status(403).json({
          error: 'ACCESS_DENIED',
          message: 'Your IP address has been temporarily banned due to persistent rate-limit abuse. Please contact security@scholarplatform.com if you believe this is an error.'
        });
      }
    } catch (e) {}
  }
  next();
};

module.exports = { rateLimitHandler, checkIpBan };
