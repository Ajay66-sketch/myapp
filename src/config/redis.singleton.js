// src/config/redis.singleton.js
// Backward-compatible singleton wrapper that forwards connection requests to the new centralized config/redisClient.js singleton.

const { getRedisClient } = require('./redisClient');

/**
 * Return the shared process-level singleton Redis client.
 */
function getRedisSingleton() {
  return getRedisClient();
}

// Ensure the helper is globally registered for legacy/framework-level boots
global.getRedisSingleton = getRedisSingleton;

module.exports = { getRedisSingleton };
