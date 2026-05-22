// src/socket/permissions.js
// Room access validation and membership tracking

/**
 * Check if user is in a room (O(1) lookup via Set)
 */
function isUserInRoom(socket, roomId) {
  return socket.data?.rooms?.has(roomId) || false;
}

/**
 * Validate room access before allowing operations
 * Throws if user not in room
 */
function validateRoomAccess(socket, roomId) {
  if (!isUserInRoom(socket, roomId)) {
    throw {
      code: 'PERMISSION_DENIED',
      message: 'User not in room',
    };
  }
}

/**
 * Track room join (adds to socket.data.rooms Set)
 */
function trackRoomJoin(socket, roomId) {
  socket.data.rooms.add(roomId);
}

/**
 * Track room leave (removes from socket.data.rooms Set)
 */
function trackRoomLeave(socket, roomId) {
  socket.data.rooms.delete(roomId);
}

module.exports = {
  isUserInRoom,
  validateRoomAccess,
  trackRoomJoin,
  trackRoomLeave,
};
