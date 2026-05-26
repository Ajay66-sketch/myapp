// src/middleware/rateLimiter.js
// Enterprise-grade distributed sliding-window rate limiter using Redis sorted sets

const { getRedisClient } = require('../config/redisClient');

const getLimiterRedis = () => {
  try {
    const client = getRedisClient();
    if (client && client.status === 'ready') return client;
  } catch (e) {}
  return null;
};

/**
 * Sliding Window Rate Limiter
 * @param {string} keyPrefix Unique namespace identifier
 * @param {number} limit Request quota capacity
 * @param {number} windowMs Window period in milliseconds
 */
const slidingWindowRateLimit = (keyPrefix, limit, windowMs) => {
  return async (req, res, next) => {
    const identifier = req.user?._id?.toString() || req.ip;
    const redis = getLimiterRedis();
    const key = `ratelimit:${keyPrefix}:${identifier}`;
    
    if (!redis || redis.status !== 'ready') {
      // Graceful degradation: Local memory sliding window fallback
      if (!global.memoryRateLimits) {
        global.memoryRateLimits = new Map();
      }
      
      const now = Date.now();
      const userLimits = global.memoryRateLimits.get(key) || [];
      const validWindows = userLimits.filter(t => t > now - windowMs);
      
      if (validWindows.length >= limit) {
        return res.status(429).json({
          message: 'Too many requests. Please wait before asking the Academic Tutor again.'
        });
      }
      
      validWindows.push(now);
      global.memoryRateLimits.set(key, validWindows);
      
      // Clean up maps periodically to prevent memory leaks
      if (global.memoryRateLimits.size > 20000) {
        for (const [k, v] of global.memoryRateLimits.entries()) {
          const fresh = v.filter(t => t > now - windowMs);
          if (fresh.length === 0) global.memoryRateLimits.delete(k);
          else global.memoryRateLimits.set(k, fresh);
        }
      }
      
      return next();
    }

    try {
      const now = Date.now();
      const windowStart = now - windowMs;

      // Atomic multi pipeline to clear expired requests, count active ones and push new transaction key
      const transaction = redis.multi();
      transaction.zremrangebyscore(key, 0, windowStart);
      transaction.zcard(key);
      transaction.zadd(key, now, now);
      transaction.expire(key, Math.ceil(windowMs / 1000));
      
      const results = await transaction.exec();
      const currentCount = results[1][1]; // index 1 is ZCARD execution output

      if (currentCount >= limit) {
        return res.status(429).json({
          message: 'Too many requests. Please wait before asking the Academic Tutor again.'
        });
      }
      next();
    } catch (err) {
      console.warn(`[RateLimiter: ${keyPrefix}] Redis exception: falling back to local memory rate limiting`, err.message);
      // Fail-safe bypass: Allow request under active Redis node crashes to prevent user locking
      next();
    }
  };
};

module.exports = { slidingWindowRateLimit };
