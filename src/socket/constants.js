// src/socket/constants.js
// Socket.IO event constants and rate limit configurations

// ─── Socket Events ──────────────────────────────────────────────────────────
// Client → Server (emit)
const CLIENT_EVENTS = {
  // Auth
  SOCKET_REAUTH: 'socket:reauth',           // Client sends new token on reconnect
  
  // User
  USER_IDENTIFY: 'user:identify',           // Send username (replaced by JWT auth)
  
  // Room
  ROOM_JOIN: 'room:join',                   // Join a study room
  ROOM_LEAVE: 'room:leave',                 // Leave a room
  
  // Timer
  TIMER_START: 'timer:start',               // Start focus timer
  TIMER_PAUSE: 'timer:pause',               // Pause timer
  TIMER_RESUME: 'timer:resume',             // Resume timer
  TIMER_CANCEL: 'timer:cancel',             // Cancel timer
  
  // Chat
  ROOM_CHAT: 'room:chat',                   // Send chat message
  ROOM_TYPING: 'room:typing',               // User is typing indicator
};

// Server → Client (emit)
const SERVER_EVENTS = {
  // Auth
  AUTH_EXPIRING: 'auth:expiring',           // Token expiring soon
  AUTH_EXPIRED: 'auth:expired',             // Token has expired
  AUTH_ERROR: 'auth:error',                 // Authentication error
  
  // Connection
  CONNECT_SUCCESS: 'connect:success',       // Connection established
  
  // Room
  ROOM_STATE: 'room:state',                 // Initial room state
  ROOM_USER_JOINED: 'room:user_joined',     // User joined room
  ROOM_USER_LEFT: 'room:user_left',         // User left room
  ROOM_ACTIVITY: 'room:activity',           // Activity log
  
  // Timer
  TIMER_SYNC: 'timer:sync',                 // Timer state sync
  TIMER_COMPLETED: 'timer:completed',       // Timer finished
  
  // Notifications
  NOTIFICATION_RECEIVED: 'notification:received',
  
  // Typing
  ROOM_TYPING: 'room:typing',               // Someone is typing
  
  // Global
  GLOBAL_STATS: 'global:stats',             // Online user count
};

// ─── Rate Limit Configurations ──────────────────────────────────────────────
// Key format: user:{userId}:{event_type}
// { limit: requests per window, windowMs: time window in milliseconds }

const RATE_LIMITS = {
  // Strict limits (prevent spam/abuse)
  TIMER_START: { limit: 3, windowMs: 5000 },      // 3 per 5 seconds
  ROOM_CHAT: { limit: 10, windowMs: 1000 },       // 10 per second max
  ROOM_TYPING: { limit: 5, windowMs: 1000 },      // 5 per second max
  
  // Moderate limits (normal usage)
  ROOM_JOIN: { limit: 5, windowMs: 60000 },       // 5 per minute
  ROOM_LEAVE: { limit: 5, windowMs: 60000 },      // 5 per minute
  TIMER_PAUSE: { limit: 10, windowMs: 60000 },    // 10 per minute
  TIMER_RESUME: { limit: 10, windowMs: 60000 },   // 10 per minute
  TIMER_CANCEL: { limit: 10, windowMs: 60000 },   // 10 per minute
  
  // Relaxed limits (infrequent actions)
  SOCKET_REAUTH: { limit: 10, windowMs: 60000 },  // 10 per minute
};

// ─── Permission Requirements ───────────────────────────────────────────────
// Events that require room membership verification
const ROOM_REQUIRED_EVENTS = new Set([
  CLIENT_EVENTS.ROOM_CHAT,
  CLIENT_EVENTS.TIMER_START,
  CLIENT_EVENTS.TIMER_PAUSE,
  CLIENT_EVENTS.TIMER_RESUME,
  CLIENT_EVENTS.TIMER_CANCEL,
  CLIENT_EVENTS.ROOM_TYPING,
]);

// ─── Token Check Interval ──────────────────────────────────────────────────
// How often to check if token is expiring (in milliseconds)
const TOKEN_CHECK_INTERVAL = 30000; // 30 seconds

// How much time before expiry to warn client (in seconds)
const TOKEN_EXPIRY_WARNING_THRESHOLD = 300; // 5 minutes

module.exports = {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  RATE_LIMITS,
  ROOM_REQUIRED_EVENTS,
  TOKEN_CHECK_INTERVAL,
  TOKEN_EXPIRY_WARNING_THRESHOLD,
};
