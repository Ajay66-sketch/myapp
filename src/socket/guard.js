// src/socket/guard.js
// SINGLE centralized validation guard for ALL socket events
// Orchestrates: authentication → rate limiting → permissions → handler execution

const auth = require('./auth');
const permissions = require('./permissions');
const rateLimiter = require('./rateLimiter');
const config = require('./config');

/**
 * guard(socket, eventName, data, ack, handler)
 *
 * Universal event validation middleware:
 * 1. Verify socket is authenticated (socket.data.userId exists)
 * 2. Check rate limits (user:{userId}:{eventType})
 * 3. Validate room permission (if EVENT_PERMISSIONS requires it)
 * 4. Execute handler (PURE business logic only)
 *
 * @param {socket} socket - Socket.IO socket instance
 * @param {string} eventName - Event name (key into EVENT_PERMISSIONS)
 * @param {object} data - Event data payload
 * @param {function} ack - Acknowledgement callback (optional)
 * @param {function} handler - Async handler (business logic only)
 */
const { findUserById } = require('../utils/authStore');
const { getPlan } = require('../utils/permissions');

async function guard(socket, eventName, data, ack, handler) {
  try {
    // 1. Authentication check
    // ────────────────────────────────────────────────────────────────────────
    if (!socket.data?.userId) {
      const error = { ...config.ERRORS.NO_TOKEN };
      return ack?.(error) || socket.emit('error', error);
    }

    // 1.5 Payload Validation check
    // ────────────────────────────────────────────────────────────────────────
    const { 
      roomJoinSchema, 
      timerStartSchema, 
      roomCommandSchema,
      validate 
    } = require('../validation/schemas');

    let schemaToUse = null;
    if (eventName === 'room:join' || eventName === 'room:chat' || eventName === 'room:typing') {
      schemaToUse = roomJoinSchema;
    } else if (eventName === 'timer:start') {
      schemaToUse = timerStartSchema;
    } else if (eventName === 'timer:pause' || eventName === 'timer:resume' || eventName === 'timer:cancel') {
      schemaToUse = roomCommandSchema;
    }

    if (schemaToUse) {
      try {
        validate(schemaToUse, data, `Socket:${eventName}`);
      } catch (err) {
        const error = {
          ...config.ERRORS.INVALID_PAYLOAD,
          message: err.message,
        };
        return ack?.(error) || socket.emit('error', error);
      }
    }

    // Load up-to-date user to ensure real-time plan status and rate limits are respected
    const user = await findUserById(socket.data.userId) || { _id: socket.data.userId, tier: 'free' };
    const plan = getPlan(user);

    // ─── Socket Priority & Priority Queue Architectural Hooks ───────────────
    socket.priority = plan.socketPriority || 0;
    
    // Future Queue processing placeholder hook:
    // Pushes messages to higher-priority Redis queues when multi-node scaling is active
    if (plan.socketPriority > 0) {
      // Hook: queue.processPrioritySocketMessage(socket.data.userId, eventName, data);
    }

    // 2. Rate limit check (using dynamic plan-based limits)
    // ────────────────────────────────────────────────────────────────────────
    const limit = await rateLimiter.checkRateLimit(user, eventName);
    if (!limit.allowed) {
      // FIX #1: Don't mutate config.ERRORS - create new object with spread
      const error = {
        ...config.ERRORS.RATE_LIMIT_EXCEEDED,
        resetIn: limit.resetIn, // Add context-specific data
      };
      return ack?.(error) || socket.emit('error', error);
    }

    // 3. Room permission check (FIX #2: use EVENT_PERMISSIONS, not RATE_LIMITS)
    // ────────────────────────────────────────────────────────────────────────
    const perms = config.EVENT_PERMISSIONS[eventName];
    if (perms?.requiresRoom) {
      const roomId = data?.[perms.roomIdParam];
      if (!roomId) {
        const error = { ...config.ERRORS.PERMISSION_DENIED };
        return ack?.(error) || socket.emit('error', error);
      }
      // FIX #3: ALL permission validation happens here, never in handlers
      permissions.validateRoomAccess(socket, roomId);
    }

    // 4. Execute handler - PURE business logic only
    // ────────────────────────────────────────────────────────────────────────
    // No auth checks should appear inside handler
    await handler();

  } catch (error) {
    // Handle validation errors from handler or permissions check
    const errCode = error.code || 'INTERNAL_ERROR';
    const errDef = config.ERRORS[errCode];

    // Build error response (FIX #1: create new object, don't mutate)
    const errorResponse = errDef ? { ...errDef } : {
      code: 'INTERNAL_ERROR',
      message: error.message || 'Internal server error',
      statusCode: 500,
      action: 'none',
    };

    // Send response
    ack?.(errorResponse) || socket.emit('error', errorResponse);
  }
}

module.exports = { guard };
