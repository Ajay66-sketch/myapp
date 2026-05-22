// src/socket/middleware/permission.js
// Socket.IO permission middleware
// Validates room membership and access control

const { createErrorResponse } = require('../utils/errors');

// In-memory room cache (for low-latency lookups)
// In production, this should be backed by Redis
const roomCache = new Map();

/**
 * Check if user is already in a room
 * @param {object} socket - Socket.IO socket instance
 * @param {string} roomId - Room ID
 * @returns {boolean} True if user is in room
 */
const isUserInRoom = (socket, roomId) => {
  return socket.data.rooms.has(roomId);
};

/**
 * Validate that user can access/join a room
 * Checks:
 * 1. Room exists
 * 2. User has permission to access
 * 3. User not already in room (optional)
 * 
 * @param {object} socket - Socket.IO socket instance
 * @param {string} roomId - Room ID to validate
 * @param {object} options - Validation options
 * @returns {object} { allowed: boolean, error?: object }
 */
const validateRoomAccess = (socket, roomId, options = {}) => {
  const { checkNotAlreadyMember = false } = options;

  // Empty room ID
  if (!roomId || typeof roomId !== 'string') {
    return {
      allowed: false,
      error: createErrorResponse('ROOM_NOT_FOUND'),
    };
  }

  // Check if user already in room (prevent duplicates)
  if (checkNotAlreadyMember && isUserInRoom(socket, roomId)) {
    return {
      allowed: false,
      error: createErrorResponse('PERMISSION_DENIED', {
        reason: 'Already in room',
      }),
    };
  }

  // In a real application:
  // - Verify room exists in database
  // - Check room permissions (public, private, password-protected, etc.)
  // - Check if user is banned from room
  // - Check concurrent user limits
  //
  // For now, all rooms are auto-created and public
  // This can be enhanced when StudyRoom model is finalized

  return { allowed: true };
};

/**
 * Validate user can perform action on room
 * @param {object} socket - Socket.IO socket instance
 * @param {string} roomId - Room ID
 * @param {string} action - Action being performed (e.g., 'chat', 'timer:start')
 * @returns {object} { allowed: boolean, error?: object }
 */
const validateRoomAction = (socket, roomId, action) => {
  // Verify user is in room
  if (!isUserInRoom(socket, roomId)) {
    return {
      allowed: false,
      error: createErrorResponse('PERMISSION_DENIED', {
        reason: 'Not in room',
      }),
    };
  }

  // Permission checks per action (can be extended)
  switch (action) {
    case 'chat':
      // Anyone in room can chat (extend with mute/ban checks)
      return { allowed: true };

    case 'timer:start':
      // Anyone in room can start timer (could restrict to room owner)
      return { allowed: true };

    case 'timer:pause':
    case 'timer:resume':
    case 'timer:cancel':
      // Timer controls - could restrict to owner or allow any
      return { allowed: true };

    default:
      return { allowed: true };
  }
};

/**
 * Add room to user's room set (for tracking membership)
 * @param {object} socket - Socket.IO socket instance
 * @param {string} roomId - Room ID to track
 */
const trackRoomJoin = (socket, roomId) => {
  socket.data.rooms.add(roomId);
  socket.data.currentRoomId = roomId;
};

/**
 * Remove room from user's room set
 * @param {object} socket - Socket.IO socket instance
 * @param {string} roomId - Room ID to untrack
 */
const trackRoomLeave = (socket, roomId) => {
  socket.data.rooms.delete(roomId);
  if (socket.data.currentRoomId === roomId) {
    socket.data.currentRoomId = null;
  }
};

module.exports = {
  isUserInRoom,
  validateRoomAccess,
  validateRoomAction,
  trackRoomJoin,
  trackRoomLeave,
};
