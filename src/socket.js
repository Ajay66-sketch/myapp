// src/socket.js
// Socket.IO server initialization with guard() pattern
// All event handlers use centralized guard() for validation
// Business logic is PURE - no auth checks in handlers

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');

const auth = require('./socket/auth');
const { guard } = require('./socket/guard');
const permissions = require('./socket/permissions');
const rateLimiter = require('./socket/rateLimiter');
const config = require('./socket/config');

let io;

// ─── In-Memory State ────────────────────────────────────────────────────────
// Note: For production multi-instance deployments, move to Redis
const onlineUsers = new Map(); // socket.id -> { userId, username, roomId, status }
const roomsState = new Map(); // roomId -> { timer: {...}, participants: Set }

const TICK_RATE = 1000; // Timer synchronization interval

/**
 * Initialize Socket.IO server with authentication and real-time features
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL || '*',
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // ─── 1. Authentication Middleware ───────────────────────────────────────
  // Runs during handshake before 'connection' event
  io.use((socket, next) => auth.authenticateSocket(socket, next));

  // ─── 2. Setup Redis Adapter (for multi-instance deployments) ────────────
  try {
    const pubClient = new Redis(process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    });
    pubClient.on('error', (err) => {
      if (err.code !== 'ECONNREFUSED') {
        console.error('Redis PubClient Error:', err.message);
      }
    });

    const subClient = pubClient.duplicate();
    subClient.on('error', (err) => {
      if (err.code !== 'ECONNREFUSED') {
        console.error('Redis SubClient Error:', err.message);
      }
    });

    io.adapter(createAdapter(pubClient, subClient));
    console.log('✅ Socket.io Redis Adapter configured');
  } catch (err) {
    console.warn('⚠️ Redis not available, Socket.io falling back to in-memory adapter');
  }

  // ─── 3. Timer Tick Broadcast (every 1 second) ──────────────────────────
  // Synchronizes timer state across all clients in a room
  setInterval(() => {
    roomsState.forEach((room, roomId) => {
      if (room.timer.state === 'running' && room.timer.remainingTime > 0) {
        room.timer.remainingTime -= 1;
        
        // Broadcast sync to all users in room
        io.to(roomId).emit(config.SERVER_EVENTS.TIMER_SYNC, room.timer);

        // Handle completion
        if (room.timer.remainingTime === 0) {
          room.timer.state = 'completed';
          io.to(roomId).emit(config.SERVER_EVENTS.TIMER_SYNC, room.timer);
          io.to(roomId).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
            type: 'system',
            message: 'Focus session completed! Great job everyone.',
          });
        }
      }
    });
  }, TICK_RATE);

  // ─── 4. Connection Handler ─────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    console.log(`[Socket.io] Client connected: ${socket.id} (User: ${userId})`);

    // Setup per-socket token expiry monitoring (FIX #5)
    auth.setupTokenExpiryTimer(socket);

    // Track user in onlineUsers
    onlineUsers.set(socket.id, {
      userId,
      username: socket.data.username || 'User',
      roomId: null,
      status: 'online',
    });

    // Emit connection success
    socket.emit(config.SERVER_EVENTS.CONNECT_SUCCESS, {
      socketId: socket.id,
      userId,
    });
    io.emit(config.SERVER_EVENTS.GLOBAL_STATS, { onlineCount: onlineUsers.size });

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT HANDLERS - All use guard() pattern
    // ═══════════════════════════════════════════════════════════════════════

    // ─── RE-AUTHENTICATION: Handle token refresh ──────────────────────────
    socket.on(config.CLIENT_EVENTS.SOCKET_REAUTH, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.SOCKET_REAUTH, data, ack, async () => {
        // PURE BUSINESS LOGIC - guard() handled all validation
        const newToken = data?.token;
        const decoded = auth.verifyToken(newToken, process.env.JWT_SECRET);

        if (!decoded) {
          throw { code: 'INVALID_TOKEN' };
        }

        // FIX #4: Verify user identity hasn't changed
        if (decoded.sub !== socket.data.userId) {
          throw { code: 'PERMISSION_DENIED' };
        }

        // Update socket data with new expiry
        socket.data.tokenExpiry = decoded.exp * 1000;

        // Reset expiry timer with new timeout
        auth.clearTokenExpiryTimer(socket);
        auth.setupTokenExpiryTimer(socket);

        ack?.({ success: true });
      });
    });

    // ─── ROOM: Join room ───────────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.ROOM_JOIN, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.ROOM_JOIN, data, ack, async () => {
        // PURE BUSINESS LOGIC
        const roomId = data.roomId;
        const user = onlineUsers.get(socket.id);

        // Leave previous room if in one
        if (user?.roomId) {
          const oldRoom = roomsState.get(user.roomId);
          if (oldRoom) {
            oldRoom.participants.delete(socket.id);
            socket.leave(`room:${user.roomId}`);
            socket.to(`room:${user.roomId}`).emit(config.SERVER_EVENTS.ROOM_USER_LEFT, {
              socketId: socket.id,
            });
            socket.to(`room:${user.roomId}`).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
              type: 'system',
              message: `${user.username} left the focus room.`,
            });
          }
        }

        // Join new room
        socket.join(`room:${roomId}`);
        user.roomId = roomId;
        permissions.trackRoomJoin(socket, roomId);
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
        socket.emit(config.SERVER_EVENTS.ROOM_STATE, {
          timer: room.timer,
          participants: Array.from(room.participants).map((id) => ({
            socketId: id,
            ...onlineUsers.get(id),
          })),
        });

        // Notify others in room
        socket.to(`room:${roomId}`).emit(config.SERVER_EVENTS.ROOM_USER_JOINED, {
          socketId: socket.id,
          user,
        });
        socket.to(`room:${roomId}`).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
          type: 'system',
          message: `${user.username} joined the focus room.`,
        });

        // Social notification
        socket.to(`room:${roomId}`).emit(config.SERVER_EVENTS.NOTIFICATION_RECEIVED, {
          _id: Date.now().toString(),
          type: 'social',
          title: 'Peer Joined',
          message: `${user.username} just joined your focus room!`,
          createdAt: new Date(),
        });

        ack?.({ success: true, roomId });
      });
    });

    // ─── TIMER: Start timer ────────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.TIMER_START, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.TIMER_START, data, ack, async () => {
        // PURE BUSINESS LOGIC - guard() verified room membership
        const roomId = data.roomId;
        const duration = data.duration;
        const room = roomsState.get(roomId);

        if (!room) {
          throw { code: 'PERMISSION_DENIED', message: 'Room not found' };
        }

        room.timer = {
          state: 'running',
          duration,
          remainingTime: duration,
        };

        io.to(`room:${roomId}`).emit(config.SERVER_EVENTS.TIMER_SYNC, room.timer);

        const user = onlineUsers.get(socket.id);
        io.to(`room:${roomId}`).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
          type: 'system',
          message: `${user?.username} started a ${duration / 60}-minute focus session.`,
        });

        ack?.({ success: true });
      });
    });

    // ─── TIMER: Pause timer ───────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.TIMER_PAUSE, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.TIMER_PAUSE, data, ack, async () => {
        // PURE BUSINESS LOGIC - guard() verified room membership
        const roomId = data.roomId;
        const room = roomsState.get(roomId);

        if (!room || room.timer.state !== 'running') {
          throw { code: 'PERMISSION_DENIED', message: 'Cannot pause timer' };
        }

        room.timer.state = 'paused';
        io.to(`room:${roomId}`).emit(config.SERVER_EVENTS.TIMER_SYNC, room.timer);

        ack?.({ success: true });
      });
    });

    // ─── TIMER: Resume timer ──────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.TIMER_RESUME, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.TIMER_RESUME, data, ack, async () => {
        // PURE BUSINESS LOGIC - guard() verified room membership
        const roomId = data.roomId;
        const room = roomsState.get(roomId);

        if (!room || room.timer.state !== 'paused') {
          throw { code: 'PERMISSION_DENIED', message: 'Cannot resume timer' };
        }

        room.timer.state = 'running';
        io.to(`room:${roomId}`).emit(config.SERVER_EVENTS.TIMER_SYNC, room.timer);

        ack?.({ success: true });
      });
    });

    // ─── TIMER: Cancel timer ──────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.TIMER_CANCEL, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.TIMER_CANCEL, data, ack, async () => {
        // PURE BUSINESS LOGIC - guard() verified room membership
        const roomId = data.roomId;
        const room = roomsState.get(roomId);

        if (!room) {
          throw { code: 'PERMISSION_DENIED', message: 'Room not found' };
        }

        room.timer.state = 'idle';
        room.timer.remainingTime = room.timer.duration;
        io.to(`room:${roomId}`).emit(config.SERVER_EVENTS.TIMER_SYNC, room.timer);

        ack?.({ success: true });
      });
    });

    // ─── CHAT: Send message ───────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.ROOM_CHAT, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.ROOM_CHAT, data, ack, async () => {
        // PURE BUSINESS LOGIC - guard() verified room membership
        const roomId = data.roomId;
        const message = data.message;
        const user = onlineUsers.get(socket.id);

        io.to(`room:${roomId}`).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
          type: 'chat',
          userId: socket.data.userId,
          username: user.username,
          message,
        });

        ack?.({ success: true });
      });
    });

    // ─── TYPING: Typing indicator ──────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.ROOM_TYPING, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.ROOM_TYPING, data, ack, async () => {
        // PURE BUSINESS LOGIC - guard() verified room membership
        const roomId = data.roomId;
        const isTyping = data.isTyping;
        const user = onlineUsers.get(socket.id);

        socket.to(`room:${roomId}`).emit(config.SERVER_EVENTS.ROOM_TYPING, {
          userId: socket.data.userId,
          username: user.username,
          isTyping,
        });

        ack?.({ success: true });
      });
    });

    // ═══════════════════════════════════════════════════════════════════════
    // DISCONNECT HANDLER - Cleanup
    // ═══════════════════════════════════════════════════════════════════════
    socket.on('disconnect', () => {
      const user = onlineUsers.get(socket.id);

      if (user?.roomId) {
        const room = roomsState.get(user.roomId);
        if (room) {
          room.participants.delete(socket.id);
          socket.to(`room:${user.roomId}`).emit(config.SERVER_EVENTS.ROOM_USER_LEFT, {
            socketId: socket.id,
          });
          socket.to(`room:${user.roomId}`).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
            type: 'system',
            message: `${user.username} disconnected.`,
          });

          // Cleanup empty rooms
          if (room.participants.size === 0) {
            roomsState.delete(user.roomId);
          }
        }

        permissions.trackRoomLeave(socket, user.roomId);
      }

      // Cleanup rate limits and timers
      rateLimiter.resetUserLimits(socket.data.userId);
      auth.clearTokenExpiryTimer(socket);

      // Cleanup user tracking
      onlineUsers.delete(socket.id);

      io.emit(config.SERVER_EVENTS.GLOBAL_STATS, { onlineCount: onlineUsers.size });
      console.log(
        `[Socket.io] Client disconnected: ${socket.id} (User: ${socket.data.userId})`
      );
    });

    // Error handler
    socket.on('error', (error) => {
      console.error(`[Socket.io Error] ${socket.id}:`, error);
    });
  });

  return io;
};

/**
 * Get Socket.IO instance (must call initSocket first)
 */
const getIO = () => {
  if (!io) {
    throw new Error('Socket.io is not initialized!');
  }
  return io;
};

module.exports = { initSocket, getIO };
