const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

const { authenticateSocket } = require('./socket/middleware/authenticate');
const {
  setupSocketAuth,
  emitAuthError,
} = require('./socket/utils/eventWrapper');
const {
  trackRoomJoin,
  trackRoomLeave,
} = require('./socket/middleware/permission');
const { resetUserRateLimits } = require('./socket/middleware/rateLimit');
const {
  CLIENT_EVENTS,
  SERVER_EVENTS,
  TOKEN_CHECK_INTERVAL,
  TOKEN_EXPIRY_WARNING_THRESHOLD,
  ROOM_REQUIRED_EVENTS,
} = require('./socket/constants');
const {
  isTokenExpiringSoon,
  getSecondsUntilExpiry,
} = require('./auth/utils/jwt.utils');

let io;

// In-memory state managers
const onlineUsers = new Map(); // socket.id -> { userId, username, roomId, status }
const roomsState = new Map(); // roomId -> { timer: { state, remainingTime, duration }, participants: Set }

const TICK_RATE = 1000; // 1 second

const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ─── Socket.IO Authentication Middleware ────────────────────────────────
  // Runs during handshake before 'connection' event
  // Verifies JWT token and rejects unauthorized connections
  io.use(authenticateSocket);

  // Setup Redis Adapter for multi-instance horizontal scaling
  try {
    const pubClient = new Redis(process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    });
    pubClient.on('error', (err) => {
      // Suppress connection refused logs in demo mode if Redis is offline
      if (err.code !== 'ECONNREFUSED') console.error('Redis PubClient Error:', err.message);
    });

    const subClient = pubClient.duplicate();
    subClient.on('error', (err) => {
      if (err.code !== 'ECONNREFUSED') console.error('Redis SubClient Error:', err.message);
    });

    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.io Redis Adapter configured');
  } catch (err) {
    console.warn('⚠️ Redis not available, Socket.io falling back to in-memory adapter');
  }

  // ─── Central Timer Tick ──────────────────────────────────────────────────
  // Synchronizes timer state across all connected clients
  setInterval(() => {
    roomsState.forEach((room, roomId) => {
      if (room.timer.state === 'running' && room.timer.remainingTime > 0) {
        room.timer.remainingTime -= 1;
        // Broadcast every second to keep everyone perfectly synced
        io.to(roomId).emit(SERVER_EVENTS.TIMER_SYNC, room.timer);

        if (room.timer.remainingTime === 0) {
          room.timer.state = 'completed';
          io.to(roomId).emit(SERVER_EVENTS.TIMER_SYNC, room.timer);
          io.to(roomId).emit(SERVER_EVENTS.ROOM_ACTIVITY, {
            type: 'system',
            message: 'Focus session completed! Great job everyone.',
          });
        }
      }
    });
  }, TICK_RATE);

  // ─── Token Expiry Check Interval ────────────────────────────────────────
  // Emits 'auth:expiring' warning when token expires in <5 minutes
  // Allows client to refresh proactively
  setInterval(() => {
    io.sockets.sockets.forEach((socket) => {
      if (!socket.data || !socket.data.userId) return;

      // Check if token expiring soon
      if (socket.data.tokenExpiry) {
        const now = Math.floor(Date.now() / 1000);
        const timeUntilExpiry = socket.data.tokenExpiry - now;
        const warningThreshold = TOKEN_EXPIRY_WARNING_THRESHOLD;

        // If token expires in less than warning threshold and hasn't warned yet
        if (timeUntilExpiry > 0 && timeUntilExpiry <= warningThreshold) {
          if (!socket.data._expiryWarned) {
            socket.emit(SERVER_EVENTS.AUTH_EXPIRING, {
              expiresIn: timeUntilExpiry,
              action: 'refresh_token',
            });
            socket.data._expiryWarned = true;
          }
        }
      }
    });
  }, TOKEN_CHECK_INTERVAL);

  // ─── Socket Connection Handler ──────────────────────────────────────────
  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id} (User: ${socket.data.userId})`);

    // Setup authenticated event handlers
    setupSocketAuth(socket);

    // Track user in onlineUsers map
    onlineUsers.set(socket.id, {
      userId: socket.data.userId,
      username: socket.data.username || 'User',
      roomId: null,
      status: 'online',
    });

    // Emit success event and global stats
    socket.emit(SERVER_EVENTS.CONNECT_SUCCESS, {
      socketId: socket.id,
      userId: socket.data.userId,
    });
    io.emit(SERVER_EVENTS.GLOBAL_STATS, { onlineCount: onlineUsers.size });

    // ─────────────────────────────────────────────────────────────────────
    // Re-authentication Handler (for token refresh)
    // Client sends new token after refresh
    // ─────────────────────────────────────────────────────────────────────
    socket.onAuth(CLIENT_EVENTS.SOCKET_REAUTH, function (data, ack) {
      const { token } = data;

      if (!token) {
        return ack?.({
          error: 'No token provided',
        });
      }

      // In production, verify token here
      // For now, trust the auth middleware validation
      socket.data._expiryWarned = false; // Reset expiry warning

      ack?.({ success: true });
    });

    // ─────────────────────────────────────────────────────────────────────
    // Room Join Handler
    // ─────────────────────────────────────────────────────────────────────
    socket.onAuth(
      CLIENT_EVENTS.ROOM_JOIN,
      function (data, ack) {
        const { roomId } = data;

        if (!roomId) {
          return ack?.({ error: 'Room ID required' });
        }

        // Leave previous room if in one
        const user = onlineUsers.get(socket.id);
        if (user?.roomId) {
          const oldRoom = roomsState.get(user.roomId);
          if (oldRoom) {
            oldRoom.participants.delete(socket.id);
            socket.leave(user.roomId);

            // Notify others
            socket.to(user.roomId).emit(SERVER_EVENTS.ROOM_USER_LEFT, {
              socketId: socket.id,
            });
            socket.to(user.roomId).emit(SERVER_EVENTS.ROOM_ACTIVITY, {
              type: 'system',
              message: `${user.username} left the focus room.`,
            });
          }
        }

        // Join new room
        socket.join(roomId);
        user.roomId = roomId;
        trackRoomJoin(socket, roomId);
        onlineUsers.set(socket.id, user);

        // Initialize room state if not exists
        if (!roomsState.has(roomId)) {
          roomsState.set(roomId, {
            timer: {
              state: 'idle',
              remainingTime: 25 * 60,
              duration: 25 * 60,
            },
            participants: new Set(),
          });
        }

        const room = roomsState.get(roomId);
        room.participants.add(socket.id);

        // Send room state to joined user
        socket.emit(SERVER_EVENTS.ROOM_STATE, {
          timer: room.timer,
          participants: Array.from(room.participants).map((id) => ({
            socketId: id,
            ...onlineUsers.get(id),
          })),
        });

        // Notify others in room
        socket.to(roomId).emit(SERVER_EVENTS.ROOM_USER_JOINED, {
          socketId: socket.id,
          user,
        });
        socket.to(roomId).emit(SERVER_EVENTS.ROOM_ACTIVITY, {
          type: 'system',
          message: `${user.username} joined the focus room.`,
        });

        // Social notification
        socket.to(roomId).emit(SERVER_EVENTS.NOTIFICATION_RECEIVED, {
          _id: Date.now().toString(),
          type: 'social',
          title: 'Peer Joined',
          message: `${user.username} just joined your focus room!`,
          createdAt: new Date(),
        });

        ack?.({ success: true, roomId });
      },
      { requireRoom: false }
    );

    // ─────────────────────────────────────────────────────────────────────
    // Timer Controls
    // ─────────────────────────────────────────────────────────────────────
    socket.onAuth(
      CLIENT_EVENTS.TIMER_START,
      function (data, ack) {
        const { roomId, duration } = data;

        if (!roomId || !duration) {
          return ack?.({ error: 'Room ID and duration required' });
        }

        const room = roomsState.get(roomId);
        if (room) {
          room.timer = {
            state: 'running',
            duration,
            remainingTime: duration,
          };
          io.to(roomId).emit(SERVER_EVENTS.TIMER_SYNC, room.timer);

          const user = onlineUsers.get(socket.id);
          io.to(roomId).emit(SERVER_EVENTS.ROOM_ACTIVITY, {
            type: 'system',
            message: `${user?.username} started a ${duration / 60}-minute focus session.`,
          });

          ack?.({ success: true });
        } else {
          ack?.({ error: 'Room not found' });
        }
      },
      { requireRoom: true }
    );

    socket.onAuth(
      CLIENT_EVENTS.TIMER_PAUSE,
      function (data, ack) {
        const { roomId } = data;

        if (!roomId) {
          return ack?.({ error: 'Room ID required' });
        }

        const room = roomsState.get(roomId);
        if (room && room.timer.state === 'running') {
          room.timer.state = 'paused';
          io.to(roomId).emit(SERVER_EVENTS.TIMER_SYNC, room.timer);
          ack?.({ success: true });
        } else {
          ack?.({ error: 'Cannot pause timer' });
        }
      },
      { requireRoom: true }
    );

    socket.onAuth(
      CLIENT_EVENTS.TIMER_RESUME,
      function (data, ack) {
        const { roomId } = data;

        if (!roomId) {
          return ack?.({ error: 'Room ID required' });
        }

        const room = roomsState.get(roomId);
        if (room && room.timer.state === 'paused') {
          room.timer.state = 'running';
          io.to(roomId).emit(SERVER_EVENTS.TIMER_SYNC, room.timer);
          ack?.({ success: true });
        } else {
          ack?.({ error: 'Cannot resume timer' });
        }
      },
      { requireRoom: true }
    );

    socket.onAuth(
      CLIENT_EVENTS.TIMER_CANCEL,
      function (data, ack) {
        const { roomId } = data;

        if (!roomId) {
          return ack?.({ error: 'Room ID required' });
        }

        const room = roomsState.get(roomId);
        if (room) {
          room.timer.state = 'idle';
          room.timer.remainingTime = room.timer.duration;
          io.to(roomId).emit(SERVER_EVENTS.TIMER_SYNC, room.timer);
          ack?.({ success: true });
        } else {
          ack?.({ error: 'Room not found' });
        }
      },
      { requireRoom: true }
    );

    // ─────────────────────────────────────────────────────────────────────
    // Chat and Activity
    // ─────────────────────────────────────────────────────────────────────
    socket.onAuth(
      CLIENT_EVENTS.ROOM_CHAT,
      function (data, ack) {
        const { roomId, message } = data;

        if (!roomId || !message) {
          return ack?.({ error: 'Room ID and message required' });
        }

        const user = onlineUsers.get(socket.id);
        io.to(roomId).emit(SERVER_EVENTS.ROOM_ACTIVITY, {
          type: 'chat',
          userId: socket.data.userId,
          username: user.username,
          message,
        });

        ack?.({ success: true });
      },
      { requireRoom: true }
    );

    socket.onAuth(
      CLIENT_EVENTS.ROOM_TYPING,
      function (data, ack) {
        const { roomId, isTyping } = data;

        if (!roomId) {
          return ack?.({ error: 'Room ID required' });
        }

        const user = onlineUsers.get(socket.id);
        socket.to(roomId).emit(SERVER_EVENTS.ROOM_TYPING, {
          userId: socket.data.userId,
          username: user.username,
          isTyping,
        });

        ack?.({ success: true });
      },
      { requireRoom: true }
    );

    // ─────────────────────────────────────────────────────────────────────
    // Disconnect Handler
    // ─────────────────────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      const user = onlineUsers.get(socket.id);

      if (user?.roomId) {
        const room = roomsState.get(user.roomId);
        if (room) {
          room.participants.delete(socket.id);
          socket.to(user.roomId).emit(SERVER_EVENTS.ROOM_USER_LEFT, {
            socketId: socket.id,
          });
          socket.to(user.roomId).emit(SERVER_EVENTS.ROOM_ACTIVITY, {
            type: 'system',
            message: `${user.username} disconnected.`,
          });

          // Cleanup empty rooms
          if (room.participants.size === 0) {
            roomsState.delete(user.roomId);
          }
        }

        trackRoomLeave(socket, user.roomId);
      }

      // Cleanup user data
      onlineUsers.delete(socket.id);
      resetUserRateLimits(socket.data.userId);

      io.emit(SERVER_EVENTS.GLOBAL_STATS, { onlineCount: onlineUsers.size });
      console.log(
        `[Socket.io] Client disconnected: ${socket.id} (User: ${socket.data.userId})`
      );
    });

    // ─────────────────────────────────────────────────────────────────────
    // Error Handler
    // ─────────────────────────────────────────────────────────────────────
    socket.on('error', (error) => {
      console.error(`[Socket.io Error] ${socket.id}:`, error);
    });
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error('Socket.io is not initialized!');
  }
  return io;
};

module.exports = { initSocket, getIO };
