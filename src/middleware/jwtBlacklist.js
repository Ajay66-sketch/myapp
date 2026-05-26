// src/middleware/jwtBlacklist.js
// Enterprise JWT Access Token Blacklist manager backing Redis

const getRedis = () => {
  try {
    return require('../socket').getRedisClient();
  } catch (err) {
    return null;
  }
};

/**
 * Checks if a JWT access token is blacklisted in Redis
 */
const isBlacklisted = async (token) => {
  if (!token) return false;
  const redis = getRedis();
  if (redis && redis.status === 'ready') {
    try {
      const isBlack = await redis.get(`blacklist:token:${token}`);
      return isBlack === '1';
    } catch (e) {
      console.error('[Blacklist Middleware] Redis get failed:', e.message);
    }
  }
  return false;
};

/**
 * Blacklists an access token in Redis until its original expiration time
 */
const addToBlacklist = async (token, expTimeSec) => {
  if (!token) return;
  const redis = getRedis();
  if (redis && redis.status === 'ready') {
    try {
      const ttl = Math.max(1, Math.ceil(expTimeSec));
      await redis.set(`blacklist:token:${token}`, '1', 'EX', ttl);
    } catch (e) {
      console.error('[Blacklist Middleware] Redis set failed:', e.message);
    }
  }
};

module.exports = { isBlacklisted, addToBlacklist };
