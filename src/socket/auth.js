// src/socket/auth.js
// JWT verification, token utilities, and per-socket expiry timers

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const config = require('./config');

/**
 * Verify JWT token signature and expiry
 * @returns {object|null} Decoded payload or null if invalid
 */
function verifyToken(token, secret) {
  try {
    return { decoded: jwt.verify(token, secret) };
  } catch (err) {
    return { error: err };
  }
}

/**
 * Extract user ID from token claims
 * Supports 'sub' (subject) or 'userId' claims
 */
function getUserIdFromToken(decoded) {
  return decoded?.sub || decoded?.userId;
}

/**
 * Check if token expiring soon (within threshold)
 * @param {object} decoded Decoded JWT payload
 * @param {number} threshold Seconds until expiry to trigger warning (default: 5 min)
 * @returns {boolean}
 */
function isTokenExpiringSoon(decoded, threshold = config.TOKEN_EXPIRY_WARNING) {
  if (!decoded?.exp) return false;
  const secondsUntilExpiry = decoded.exp - Math.floor(Date.now() / 1000);
  return secondsUntilExpiry > 0 && secondsUntilExpiry <= threshold;
}

/**
 * Get seconds until token expiry
 */
function getSecondsUntilExpiry(decoded) {
  if (!decoded?.exp) return 0;
  return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
}

/**
 * Authenticate socket on connection (runs in io.use middleware)
 * Verifies JWT, device fingerprint, and attaches user data to socket
 */
function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;
  
  if (!token) {
    return next(config.ERRORS.NO_TOKEN);
  }
  
  const { decoded, error } = verifyToken(token, env.getJwtSecret());

  if (error) {
    if (error.name === 'TokenExpiredError') {
      return next(config.ERRORS.TOKEN_EXPIRED);
    }
    return next(config.ERRORS.INVALID_TOKEN);
  }

  if (decoded.tokenType && decoded.tokenType !== 'access') {
    return next(config.ERRORS.INVALID_TOKEN);
  }

  // Verify device fingerprint (prevents token theft across devices)
  const clientFingerprint = socket.handshake.auth?.deviceId;
  const tokenFingerprint = decoded.deviceId;
  if (clientFingerprint !== tokenFingerprint) {
    return next(config.ERRORS.DEVICE_ID_MISMATCH);
  }
  
  // Attach user data to socket for later access
  socket.data.userId = getUserIdFromToken(decoded);
  socket.data.username = decoded.username || 'User';
  socket.data.sessionId = decoded.sessionId;
  socket.data.deviceId = decoded.deviceId;
  socket.data.tokenExpiry = decoded.exp * 1000; // Convert to milliseconds
  socket.data.rooms = new Set(); // Track user's rooms
  socket.user = {
    userId: socket.data.userId,
    username: socket.data.username,
  };
  
  next();
}

/**
 * Setup per-socket token expiry monitoring
 * FIX #5: Per-socket timer is more scalable than global interval scanning
 * Emits 'auth:expiring' when token <5min remaining
 */
function setupTokenExpiryTimer(socket) {
  // Clear any existing timer
  if (socket._tokenExpiryTimer) {
    clearInterval(socket._tokenExpiryTimer);
  }
  
  const cleanupManager = require('../core/cleanupManager');
  socket._tokenExpiryTimer = setInterval(() => {
    // Skip if socket disconnected or no expiry data
    if (!socket.connected || !socket.data?.tokenExpiry) return;
    
    const decoded = {
      exp: Math.floor(socket.data.tokenExpiry / 1000),
    };
    
    // Emit warning if expiring soon
    if (isTokenExpiringSoon(decoded)) {
      const secondsUntilExpiry = getSecondsUntilExpiry(decoded);
      socket.emit(config.SERVER_EVENTS.AUTH_EXPIRING, {
        secondsUntilExpiry: Math.floor(secondsUntilExpiry),
        action: 'refresh_token',
      });
    }
  }, config.TOKEN_CHECK_INTERVAL);
  cleanupManager.registerInterval(socket._tokenExpiryTimer);
}

/**
 * Clear per-socket expiry timer on disconnect
 */
function clearTokenExpiryTimer(socket) {
  if (socket._tokenExpiryTimer) {
    const cleanupManager = require('../core/cleanupManager');
    cleanupManager.deregisterInterval(socket._tokenExpiryTimer);
    clearInterval(socket._tokenExpiryTimer);
    socket._tokenExpiryTimer = null;
  }
}

module.exports = {
  verifyToken,
  getUserIdFromToken,
  isTokenExpiringSoon,
  getSecondsUntilExpiry,
  authenticateSocket,
  setupTokenExpiryTimer,
  clearTokenExpiryTimer,
};
