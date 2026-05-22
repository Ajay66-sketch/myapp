// src/auth/utils/jwt.utils.js
// JWT verification and claims extraction utilities

const jwt = require('jsonwebtoken');

/**
 * Verify JWT token and return decoded payload
 * @param {string} token - JWT token to verify
 * @param {string} secret - JWT secret key
 * @returns {object} Decoded payload or null if invalid
 */
const verifyToken = (token, secret) => {
  try {
    const decoded = jwt.verify(token, secret);
    return decoded;
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return {
        _expired: true,
        expiresAt: error.expiredAt,
        message: 'Token expired',
      };
    }
    // Invalid signature, malformed, etc.
    return null;
  }
};

/**
 * Decode JWT without verification (use only for expiry checks, not auth)
 * @param {string} token - JWT token
 * @returns {object} Decoded payload or null
 */
const decodeToken = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    return null;
  }
};

/**
 * Check if token will expire within specified seconds
 * @param {object} decoded - Decoded JWT payload
 * @param {number} secondsUntilExpiry - Threshold in seconds (default 300 = 5min)
 * @returns {boolean} True if token expires soon
 */
const isTokenExpiringSoon = (decoded, secondsUntilExpiry = 300) => {
  if (!decoded || !decoded.exp) return false;
  
  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = decoded.exp - now;
  
  return timeUntilExpiry > 0 && timeUntilExpiry <= secondsUntilExpiry;
};

/**
 * Check if token is already expired
 * @param {object} decoded - Decoded JWT payload
 * @returns {boolean} True if expired
 */
const isTokenExpired = (decoded) => {
  if (!decoded || !decoded.exp) return true;
  
  const now = Math.floor(Date.now() / 1000);
  return decoded.exp <= now;
};

/**
 * Get seconds until token expires
 * @param {object} decoded - Decoded JWT payload
 * @returns {number} Seconds until expiry, or 0 if expired
 */
const getSecondsUntilExpiry = (decoded) => {
  if (!decoded || !decoded.exp) return 0;
  
  const now = Math.floor(Date.now() / 1000);
  const diff = decoded.exp - now;
  
  return Math.max(0, diff);
};

/**
 * Extract user ID from JWT payload
 * Supports both 'sub' (standard) and 'userId' (legacy)
 * @param {object} decoded - Decoded JWT payload
 * @returns {string} User ID or null
 */
const getUserIdFromToken = (decoded) => {
  if (!decoded) return null;
  return decoded.sub || decoded.userId || null;
};

/**
 * Extract session ID from JWT payload
 * @param {object} decoded - Decoded JWT payload
 * @returns {string} Session ID or null
 */
const getSessionIdFromToken = (decoded) => {
  if (!decoded) return null;
  return decoded.sessionId || null;
};

/**
 * Extract device ID from JWT payload
 * @param {object} decoded - Decoded JWT payload
 * @returns {string} Device ID or null
 */
const getDeviceIdFromToken = (decoded) => {
  if (!decoded) return null;
  return decoded.deviceId || null;
};

module.exports = {
  verifyToken,
  decodeToken,
  isTokenExpiringSoon,
  isTokenExpired,
  getSecondsUntilExpiry,
  getUserIdFromToken,
  getSessionIdFromToken,
  getDeviceIdFromToken,
};
