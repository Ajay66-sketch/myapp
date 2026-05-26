// src/socket/rateLimiter.js
// Rate limiting: per-user, per-event-type with in-memory store

const { getRateLimits } = require('../utils/permissions');

// In-memory store: key = "userId:eventType", value = { count, resetAt, limit }
const rateLimitStore = new Map();

/**
 * Check rate limit for user + event combination
 * Returns { allowed, remaining, resetIn }
 * 
 * @param {object|string} userOrId - User object or userId string
 * @param {string} eventType - The socket event name
 */
/**
 * Internal helper for in-memory fallback tracking
 */
function _getInMemoryLimit(key, limit) {
  const now = Date.now();
  let entry = rateLimitStore.get(key);
  
  if (!entry || now > entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + limit.windowMs,
      limit: limit.limit,
    };
    rateLimitStore.set(key, entry);
  }
  
  const allowed = entry.count < entry.limit;
  if (allowed) {
    entry.count++;
  }
  
  return {
    allowed,
    remaining: Math.max(0, entry.limit - entry.count),
    resetIn: Math.max(0, entry.resetAt - now),
  };
}

/**
 * Check rate limit for user + event combination
 * Returns { allowed, remaining, resetIn } (or Promise of same if Redis is connected)
 * 
 * @param {object|string} userOrId - User object or userId string
 * @param {string} eventType - The socket event name
 */
function checkRateLimit(userOrId, eventType) {
  // If a string (userId) is passed, construct a mock user object with that ID and free tier
  const user = typeof userOrId === 'string' ? { _id: userOrId, tier: 'free' } : userOrId;
  const userId = user?._id?.toString() || 'anonymous';
  const key = `ratelimit:${userId}:${eventType}`;
  
  // Retrieve tier-aware limits dynamically from permission engine
  const limits = getRateLimits(user);
  const limit = limits?.rateLimits?.[eventType];
  
  // Events without rate limit config are always allowed
  if (!limit) {
    return { allowed: true, remaining: Infinity, resetIn: 0 };
  }
  
  // If rate limit is Infinity, bypass rate limiting entirely
  if (limit.limit === Infinity) {
    return { allowed: true, remaining: Infinity, resetIn: 0 };
  }
  
  // Try to load active Redis client dynamically to avoid circular dependencies
  let redisClient = null;
  try {
    const socketModule = require('../socket');
    if (socketModule && typeof socketModule.getRedisClient === 'function') {
      redisClient = socketModule.getRedisClient();
    }
  } catch (err) {
    // Dynamic import fallback for early bootstrap or test runners
  }

  // ─── Distributed Redis Pathway (Production Cluster Mode) ──────────────────
  if (redisClient && redisClient.status === 'ready') {
    return (async () => {
      try {
        const multi = redisClient.multi();
        multi.incr(key);
        multi.ttl(key);
        const results = await multi.exec();

        const count = results[0][1];
        let ttl = results[1][1];

        // If newly created or TTL is missing, apply expiration window
        if (count === 1 || ttl < 0) {
          const seconds = Math.max(1, Math.ceil(limit.windowMs / 1000));
          await redisClient.expire(key, seconds);
          ttl = seconds;
        }

        const allowed = count <= limit.limit;
        return {
          allowed,
          remaining: Math.max(0, limit.limit - count),
          resetIn: Math.max(0, ttl * 1000),
        };
      } catch (redisError) {
        console.error('[RateLimiter Redis Error] falling back to memory store:', redisError.message);
        return _getInMemoryLimit(key, limit);
      }
    })();
  }
  
  // ─── Local In-Memory Fallback Pathway (Dev / Test Runner Mode) ─────────────
  return _getInMemoryLimit(key, limit);
}

/**
 * Clear all rate limit entries for a user (on disconnect)
 */
function resetUserLimits(userId) {
  for (const key of rateLimitStore.keys()) {
    if (key.startsWith(`${userId}:`)) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Cleanup expired entries (runs every 10 seconds)
 * Prevents memory accumulation
 */
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

// Auto-cleanup interval
const cleanupInterval = setInterval(cleanup, 10000);

/**
 * Graceful shutdown: clear cleanup interval
 */
function destroy() {
  clearInterval(cleanupInterval);
  rateLimitStore.clear();
}

module.exports = {
  checkRateLimit,
  resetUserLimits,
  cleanup,
  destroy,
};
