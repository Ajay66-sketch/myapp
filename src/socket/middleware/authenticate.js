// src/socket/middleware/authenticate.js
// Socket.IO authentication middleware
// Verifies JWT token during handshake and validates on reconnect

const jwt = require('jsonwebtoken');
const {
  verifyToken,
  isTokenExpired,
  getUserIdFromToken,
  getSessionIdFromToken,
  getDeviceIdFromToken,
} = require('../../auth/utils/jwt.utils');
const { createErrorResponse } = require('../utils/errors');

/**
 * Socket.IO middleware to authenticate connections
 * Runs during socket handshake before 'connection' event
 * 
 * Expected client auth format:
 * io.connect(url, {
 *   auth: {
 *     token: 'JWT_TOKEN',
 *     deviceId: 'DEVICE_FINGERPRINT'
 *   }
 * })
 */
const authenticateSocket = async (socket, next) => {
  try {
    // Extract token from handshake auth
    const token = socket.handshake.auth?.token;
    const deviceId = socket.handshake.auth?.deviceId;

    // ─── Check token exists ──────────────────────────────────────────────
    if (!token) {
      const error = new Error(JSON.stringify(
        createErrorResponse('NO_TOKEN')
      ));
      error.data = createErrorResponse('NO_TOKEN');
      return next(error);
    }

    // ─── Verify JWT signature ────────────────────────────────────────────
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('JWT_SECRET not configured');
      const error = new Error('Server authentication error');
      error.data = createErrorResponse('INVALID_TOKEN');
      return next(error);
    }

    const decoded = verifyToken(token, secret);

    // Handle token expiration
    if (decoded?._expired) {
      const error = new Error(JSON.stringify(
        createErrorResponse('TOKEN_EXPIRED', {
          expiresAt: decoded.expiresAt,
        })
      ));
      error.data = createErrorResponse('TOKEN_EXPIRED');
      return next(error);
    }

    // Handle invalid token
    if (!decoded || typeof decoded !== 'object') {
      const error = new Error(JSON.stringify(
        createErrorResponse('INVALID_TOKEN')
      ));
      error.data = createErrorResponse('INVALID_TOKEN');
      return next(error);
    }

    // ─── Extract user claims ────────────────────────────────────────────
    const userId = getUserIdFromToken(decoded);
    const sessionId = getSessionIdFromToken(decoded);
    const tokenDeviceId = getDeviceIdFromToken(decoded);

    if (!userId) {
      const error = new Error(JSON.stringify(
        createErrorResponse('INVALID_TOKEN', { reason: 'Missing userId' })
      ));
      error.data = createErrorResponse('INVALID_TOKEN');
      return next(error);
    }

    // ─── Verify device consistency ───────────────────────────────────────
    // If client provides deviceId, it must match token's deviceId
    // This prevents token theft across devices
    if (deviceId && tokenDeviceId && deviceId !== tokenDeviceId) {
      const error = new Error(JSON.stringify(
        createErrorResponse('DEVICE_ID_MISMATCH')
      ));
      error.data = createErrorResponse('DEVICE_ID_MISMATCH');
      return next(error);
    }

    // ─── Attach user data to socket ──────────────────────────────────────
    // This data is immutable and used for all permission checks
    socket.data = {
      userId,
      sessionId,
      deviceId: deviceId || tokenDeviceId,
      
      // Decoded claims (for reference)
      tokenExpiry: decoded.exp,
      
      // Socket metadata
      connectedAt: Date.now(),
      ip: socket.request.connection.remoteAddress,
      userAgent: socket.request.headers['user-agent'],
      
      // Room management
      currentRoomId: null,
      rooms: new Set(),
      
      // Activity tracking
      lastEventTime: {},
      lastActivity: Date.now(),
    };

    // Success - user is authenticated
    next();

  } catch (error) {
    console.error('[Socket Auth] Unexpected error:', error.message);
    
    const authError = new Error(JSON.stringify(
      createErrorResponse('INVALID_TOKEN', { reason: error.message })
    ));
    authError.data = createErrorResponse('INVALID_TOKEN');
    next(authError);
  }
};

/**
 * Verify JWT validity for event processing
 * Can be called mid-request to ensure token hasn't expired
 * 
 * @param {object} socket - Socket.IO socket instance
 * @param {string} token - JWT token to verify
 * @returns {object} { valid: boolean, error?: object, expiresIn?: number }
 */
const validateTokenForEvent = (socket, token) => {
  const secret = process.env.JWT_SECRET;

  const decoded = verifyToken(token, secret);

  // Check if token expired
  if (decoded?._expired) {
    return {
      valid: false,
      error: createErrorResponse('TOKEN_EXPIRED'),
      expiresIn: 0,
    };
  }

  // Check if token is invalid
  if (!decoded || typeof decoded !== 'object') {
    return {
      valid: false,
      error: createErrorResponse('INVALID_TOKEN'),
    };
  }

  // Verify userId matches (prevent token swapping)
  const userId = getUserIdFromToken(decoded);
  if (userId !== socket.data.userId) {
    return {
      valid: false,
      error: createErrorResponse('INVALID_TOKEN', { reason: 'User mismatch' }),
    };
  }

  // Calculate time remaining
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = Math.max(0, decoded.exp - now);

  return {
    valid: true,
    expiresIn,
  };
};

module.exports = {
  authenticateSocket,
  validateTokenForEvent,
};
