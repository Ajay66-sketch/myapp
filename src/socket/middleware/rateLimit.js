// src/socket/middleware/rateLimit.js
// Socket.IO rate limiting middleware
// Prevents spam and abuse by limiting event frequency per user

const rateLimitStore = require('../utils/rateLimitStore');
const { createErrorResponse } = require('../utils/errors');
const { RATE_LIMITS } = require('../constants');

/**
 * Check rate limit for an event
 * @param {string} userId - User ID
 * @param {string} eventType - Event type (e.g., 'room:chat')
 * @returns {object} { allowed: boolean, remaining?: number, resetIn?: number }
 */
const checkRateLimit = (userId, eventType) => {
  const limit = RATE_LIMITS[eventType];

  // If no limit defined, allow the event
  if (!limit) {
    return { allowed: true };
  }

  // Generate unique key for this user + event combination
  const key = `user:${userId}:${eventType}`;

  // Check against limit
  const result = rateLimitStore.check(key, limit.limit, limit.windowMs);

  return {
    allowed: result.allowed,
    remaining: result.remaining,
    resetIn: result.resetIn,
    limit: result.limit,
  };
};

/**
 * Factory to create rate limit validation for specific events
 * Used to wrap socket.onAuth() event handlers
 * 
 * @param {string} eventType - Event type constant
 * @returns {function} Middleware function to check rate limit
 */
const createRateLimitValidator = (eventType) => {
  return (socket) => {
    const result = checkRateLimit(socket.data.userId, eventType);

    if (!result.allowed) {
      const error = createErrorResponse('RATE_LIMIT_EXCEEDED', {
        resetIn: result.resetIn,
        remaining: result.remaining,
      });

      return {
        error,
        allowed: false,
      };
    }

    return {
      allowed: true,
      remaining: result.remaining,
    };
  };
};

/**
 * Reset rate limits for a user when they disconnect
 * Prevents stale entries from consuming memory
 * 
 * @param {string} userId - User ID
 */
const resetUserRateLimits = (userId) => {
  rateLimitStore.resetUser(userId);
};

module.exports = {
  checkRateLimit,
  createRateLimitValidator,
  resetUserRateLimits,
};
