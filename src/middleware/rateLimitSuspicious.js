// src/middleware/rateLimitSuspicious.js
// Rate limit escalation for repeated auth failures or suspicious requests

const systemEventBus = require('../telemetry/eventBus');

const getRedis = () => {
  try {
    return require('../socket').getRedisClient();
  } catch (err) {
    return null;
  }
};

const FAILURES_LIMIT = 5;
const WINDOW_SEC = 300; // 5 minutes
const BLOCK_SEC = 3600; // 1 hour block duration

const getClientIp = (req) => {
  return req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
};

/**
 * Records a suspicious failure against an IP and escalates to a block if limit is exceeded
 */
const recordSuspiciousActivity = async (ip) => {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') return;

  try {
    const blockKey = `suspicious:blocked:${ip}`;
    const failKey = `suspicious:failures:${ip}`;

    // If already blocked, return early
    const isBlocked = await redis.get(blockKey);
    if (isBlocked) return;

    // Increment failures
    const count = await redis.incr(failKey);
    if (count === 1) {
      await redis.expire(failKey, WINDOW_SEC);
    }

    if (count >= FAILURES_LIMIT) {
      // Escalate to active block
      await redis.set(blockKey, '1', 'EX', BLOCK_SEC);
      await redis.del(failKey);
      
      systemEventBus.emit('security:ip_blocked', 'warn', {
        ip,
        reason: `Exceeded ${FAILURES_LIMIT} failures in ${WINDOW_SEC}s`
      }, 'security');
    }
  } catch (e) {
    console.error('[RateLimitSuspicious] Recording failure failed:', e.message);
  }
};

/**
 * Express middleware rejecting blocked IPs
 */
const checkSuspiciousBlock = async (req, res, next) => {
  const redis = getRedis();
  if (!redis || redis.status !== 'ready') {
    return next();
  }

  try {
    const ip = getClientIp(req);
    const blockKey = `suspicious:blocked:${ip}`;
    const isBlocked = await redis.get(blockKey);

    if (isBlocked === '1') {
      return res.status(429).json({
        error: 'SUSPICIOUS_ACTIVITY_BLOCKED',
        message: 'Your IP address has been temporarily blocked due to repeated suspicious activity. Please try again in 1 hour.'
      });
    }
  } catch (e) {
    console.error('[RateLimitSuspicious] Block check failed:', e.message);
  }

  next();
};

module.exports = {
  recordSuspiciousActivity,
  checkSuspiciousBlock,
  getClientIp
};
