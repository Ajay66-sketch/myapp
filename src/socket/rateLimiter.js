// src/socket/rateLimiter.js
// Rate limiting: per-user, per-event-type with in-memory store

const config = require('./config');

// In-memory store: key = "userId:eventType", value = { count, resetAt, limit }
const rateLimitStore = new Map();

/**
 * Check rate limit for user + event combination
 * Returns { allowed, remaining, resetIn }
 */
function checkRateLimit(userId, eventType) {
  const key = `${userId}:${eventType}`;
  const limit = config.RATE_LIMITS[eventType];
  
  // Events without rate limit config are always allowed
  if (!limit) {
    return { allowed: true, remaining: Infinity, resetIn: 0 };
  }
  
  const now = Date.now();
  let entry = rateLimitStore.get(key);
  
  // Initialize or reset window if expired
  if (!entry || now > entry.resetAt) {
    entry = {
      count: 0,
      resetAt: now + limit.windowMs,
      limit: limit.limit,
    };
    rateLimitStore.set(key, entry);
  }
  
  // Check if under limit and increment
  const allowed = entry.count < entry.limit;
  if (allowed) {
    entry.count++;
  }
  
  return {
    allowed,
    remaining: entry.limit - entry.count,
    resetIn: entry.resetAt - now,
  };
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
