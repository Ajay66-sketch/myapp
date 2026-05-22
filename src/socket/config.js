// src/socket/config.js
// Centralized Socket.IO configuration: events, limits, permissions, and errors

// ─── Client → Server Events ─────────────────────────────────────────────────
const CLIENT_EVENTS = {
  // Auth
  SOCKET_REAUTH: 'socket:reauth',
  USER_IDENTIFY: 'user:identify',
  
  // Room
  ROOM_JOIN: 'room:join',
  ROOM_LEAVE: 'room:leave',
  
  // Timer
  TIMER_START: 'timer:start',
  TIMER_PAUSE: 'timer:pause',
  TIMER_RESUME: 'timer:resume',
  TIMER_CANCEL: 'timer:cancel',
  
  // Chat & Activity
  ROOM_CHAT: 'room:chat',
  ROOM_TYPING: 'room:typing',
};

// ─── Server → Client Events ────────────────────────────────────────────────
const SERVER_EVENTS = {
  // Auth
  AUTH_EXPIRING: 'auth:expiring',
  AUTH_EXPIRED: 'auth:expired',
  AUTH_ERROR: 'auth:error',
  
  // Connection
  CONNECT_SUCCESS: 'connect:success',
  
  // Room
  ROOM_STATE: 'room:state',
  ROOM_USER_JOINED: 'room:user_joined',
  ROOM_USER_LEFT: 'room:user_left',
  ROOM_ACTIVITY: 'room:activity',
  ROOM_TYPING: 'room:typing',
  
  // Timer
  TIMER_SYNC: 'timer:sync',
  TIMER_COMPLETED: 'timer:completed',
  
  // Notifications
  NOTIFICATION_RECEIVED: 'notification:received',
  
  // Global
  GLOBAL_STATS: 'global:stats',
};

// ─── Rate Limits: Per Event, Per User ──────────────────────────────────────
// Format: { limit: max requests, windowMs: time window in milliseconds }
const RATE_LIMITS = {
  'timer:start': { limit: 3, windowMs: 5000 },
  'room:chat': { limit: 10, windowMs: 1000 },
  'room:typing': { limit: 5, windowMs: 1000 },
  'room:join': { limit: 5, windowMs: 60000 },
  'room:leave': { limit: 5, windowMs: 60000 },
  'timer:pause': { limit: 10, windowMs: 60000 },
  'timer:resume': { limit: 10, windowMs: 60000 },
  'timer:cancel': { limit: 10, windowMs: 60000 },
  'socket:reauth': { limit: 10, windowMs: 60000 },
};

// ─── Event Permissions: Which Events Require Room Membership ──────────────
// Format: { eventName: { requiresRoom: bool, roomIdParam: string } }
const EVENT_PERMISSIONS = {
  'room:chat': { requiresRoom: true, roomIdParam: 'roomId' },
  'room:typing': { requiresRoom: true, roomIdParam: 'roomId' },
  'timer:start': { requiresRoom: true, roomIdParam: 'roomId' },
  'timer:pause': { requiresRoom: true, roomIdParam: 'roomId' },
  'timer:resume': { requiresRoom: true, roomIdParam: 'roomId' },
  'timer:cancel': { requiresRoom: true, roomIdParam: 'roomId' },
  // Events without entry don't require room membership
};

// ─── Error Definitions: Never Mutated Directly ─────────────────────────────
// (Always spread when adding context-specific data)
const ERRORS = {
  NO_TOKEN: {
    code: 'NO_TOKEN',
    message: 'No authentication token provided',
    statusCode: 401,
    action: 'redirect_to_login',
    recoverable: false,
  },
  INVALID_TOKEN: {
    code: 'INVALID_TOKEN',
    message: 'Invalid authentication token',
    statusCode: 401,
    action: 'refresh_and_reconnect',
    recoverable: true,
  },
  TOKEN_EXPIRED: {
    code: 'TOKEN_EXPIRED',
    message: 'Token has expired',
    statusCode: 401,
    action: 'refresh_and_reconnect',
    recoverable: true,
  },
  TOKEN_EXPIRING: {
    code: 'TOKEN_EXPIRING',
    message: 'Token expiring soon',
    statusCode: 401,
    action: 'refresh_token',
    recoverable: true,
  },
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Rate limit exceeded',
    statusCode: 429,
    action: 'wait_and_retry',
    recoverable: true,
  },
  PERMISSION_DENIED: {
    code: 'PERMISSION_DENIED',
    message: 'Permission denied',
    statusCode: 403,
    action: 'none',
    recoverable: false,
  },
  DEVICE_ID_MISMATCH: {
    code: 'DEVICE_ID_MISMATCH',
    message: 'Device fingerprint mismatch',
    statusCode: 401,
    action: 'redirect_to_login',
    recoverable: false,
  },
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    statusCode: 500,
    action: 'none',
    recoverable: false,
  },
};

// ─── Token Configuration ──────────────────────────────────────────────────
const TOKEN_CHECK_INTERVAL = 30000; // Check expiry every 30 seconds per socket
const TOKEN_EXPIRY_WARNING = 300; // Warn when <5 minutes remaining

module.exports = {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  RATE_LIMITS,
  EVENT_PERMISSIONS,
  ERRORS,
  TOKEN_CHECK_INTERVAL,
  TOKEN_EXPIRY_WARNING,
};
