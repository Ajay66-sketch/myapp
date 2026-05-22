// src/socket/utils/eventWrapper.js
// Socket.IO event wrapper with authentication and validation
// Provides a safe way to define events with automatic auth checks

const {
  validateTokenForEvent,
} = require('../middleware/authenticate');
const {
  checkRateLimit,
  resetUserRateLimits,
} = require('../middleware/rateLimit');
const {
  validateRoomAccess,
  validateRoomAction,
  isUserInRoom,
} = require('../middleware/permission');
const { RATE_LIMITS, ROOM_REQUIRED_EVENTS } = require('../constants');
const { createErrorResponse } = require('./errors');

/**
 * Create an event handler that includes authentication and validation
 * 
 * Usage:
 * socket.onAuth('room:chat', async (data, ack) => {
 *   // Handler is automatically authenticated
 *   // socket.data.userId is verified
 * })
 * 
 * @param {object} socket - Socket.IO socket instance
 * @param {string} eventType - Event name
 * @param {function} handler - Event handler function
 * @param {object} options - Handler options
 */
const createAuthenticatedEventHandler = (socket, eventType, handler, options = {}) => {
  const {
    requireRoom = false,
    roomIdParam = 'roomId',
    validation = null,
  } = options;

  // Attach onAuth method to socket if not already present
  if (!socket.onAuth) {
    socket.onAuth = (event, h, opts) => {
      createAuthenticatedEventHandler(socket, event, h, opts);
    };
  }

  // Register event handler with validation wrapper
  socket.on(eventType, async (data, ack) => {
    try {
      // ─── Step 1: Verify socket is still authenticated ──────────────────
      // Check socket.data exists (set during connection auth)
      if (!socket.data || !socket.data.userId) {
        const error = createErrorResponse('AUTH_ERROR', {
          reason: 'Socket not authenticated',
        });
        if (typeof ack === 'function') {
          return ack({ error });
        }
        return socket.emit('auth:error', error);
      }

      // ─── Step 2: Check rate limit ─────────────────────────────────────
      const rateCheckResult = checkRateLimit(socket.data.userId, eventType);
      if (!rateCheckResult.allowed) {
        const error = createErrorResponse('RATE_LIMIT_EXCEEDED', {
          resetIn: rateCheckResult.resetIn,
          remaining: rateCheckResult.remaining,
        });
        if (typeof ack === 'function') {
          return ack({ error });
        }
        return socket.emit('error', error);
      }

      // ─── Step 3: Validate input data ───────────────────────────────────
      if (validation && typeof validation === 'function') {
        const validationError = validation(data);
        if (validationError) {
          const error = createErrorResponse('INVALID_TOKEN', {
            reason: validationError,
          });
          if (typeof ack === 'function') {
            return ack({ error });
          }
          return socket.emit('error', error);
        }
      }

      // ─── Step 4: Validate room access if required ──────────────────────
      if (requireRoom && data && data[roomIdParam]) {
        const roomId = data[roomIdParam];

        // Check if user is in room (for chat, timer, etc.)
        if (!isUserInRoom(socket, roomId)) {
          const error = createErrorResponse('PERMISSION_DENIED', {
            reason: 'Not in room',
          });
          if (typeof ack === 'function') {
            return ack({ error });
          }
          return socket.emit('error', error);
        }

        // Check specific action permission
        const actionCheck = validateRoomAction(socket, roomId, eventType);
        if (!actionCheck.allowed) {
          if (typeof ack === 'function') {
            return ack({ error: actionCheck.error });
          }
          return socket.emit('error', actionCheck.error);
        }
      }

      // ─── Step 5: Update activity tracking ──────────────────────────────
      socket.data.lastActivity = Date.now();
      socket.data.lastEventTime[eventType] = Date.now();

      // ─── Step 6: Execute handler ──────────────────────────────────────
      // Pass socket, data, and ack to handler
      await handler.call(socket, data, ack);

    } catch (error) {
      console.error(`[Socket Event Error] ${eventType}:`, error.message);

      const errorResponse = createErrorResponse('INVALID_TOKEN', {
        reason: error.message,
      });

      if (typeof ack === 'function') {
        return ack({ error: errorResponse });
      }

      socket.emit('error', errorResponse);
    }
  });
};

/**
 * Add onAuth method to socket instance
 * Makes it easy to register authenticated events
 * 
 * Usage:
 * setupSocketAuth(socket)
 * socket.onAuth('room:chat', handler, options)
 * 
 * @param {object} socket - Socket.IO socket instance
 */
const setupSocketAuth = (socket) => {
  socket.onAuth = function (eventType, handler, options = {}) {
    createAuthenticatedEventHandler(this, eventType, handler, options);
  };
};

/**
 * Emit auth error to client with action guidance
 * @param {object} socket - Socket.IO socket instance
 * @param {string} errorCode - Error code
 * @param {object} additional - Additional data
 */
const emitAuthError = (socket, errorCode, additional = {}) => {
  const error = createErrorResponse(errorCode, additional);
  socket.emit('auth:error', error);
};

/**
 * Check if event requires room membership
 * @param {string} eventType - Event type
 * @returns {boolean} True if room is required
 */
const requiresRoomMembership = (eventType) => {
  return ROOM_REQUIRED_EVENTS.has(eventType);
};

module.exports = {
  createAuthenticatedEventHandler,
  setupSocketAuth,
  emitAuthError,
  requiresRoomMembership,
};
