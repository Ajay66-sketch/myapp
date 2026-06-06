// src/socket.js
// Socket.IO server initialization with guard() pattern
// All event handlers use centralized guard() for validation
// Business logic is PURE - no auth checks in handlers

const { Server } = require('socket.io');
const { createAdapter } = require('@socket.io/redis-adapter');
const Redis = require('ioredis');
const { getRedisSubClient } = require('./config/redisClient');
const { getRedisSingleton } = require('./config/redis.singleton');

const prometheus = require('./metrics/prometheus');
const auth = require('./socket/auth');
const env = require('./config/env');
const status = require('./config/status');
const { guard } = require('./socket/guard');
const permissions = require('./socket/permissions');
const rateLimiter = require('./socket/rateLimiter');
const config = require('./socket/config');

const monetizationPermissions = require('./utils/permissions');
const roomStore = require('./utils/roomStore');
const { findUserById } = require('./utils/authStore');
const { sanitizeMessage } = require('./utils/sanitizer');
const { logAuditEvent } = require('./utils/auditLogger');
const notificationService = require('./services/notificationService');

const presenceService = require('./socket/presence/presenceService');
const timerController = require('./socket/timer/timerController');

// Bootstrap services (event-driven wiring)
require('./socket/ai/tutorService');
require('./socket/xp/xpService');
require('./socket/notifications/notificationService');
require('./socket/telemetry/eventBus');

const { onlineUsers, roomsState, onlineUsersByUserId, activeTypingUsers } = presenceService;

const isVercel = Boolean(process.env.VERCEL);
let io;
let redisClientInstance = null;

const buildChatMessage = ({ userId, username, message, room = 'global' }) => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
  type: 'chat_message',
  room,
  message,
  user: {
    userId,
    username,
  },
  timestamp: Date.now(),
});

/**
 * Initialize Socket.IO server with authentication and real-time features
 */
const initSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: env.getSocketOrigin(),
      methods: ['GET', 'POST'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      credentials: true,
    },
    transports: ['websocket'],
  });

  console.log('Socket.IO transport hardened: websocket exclusively');
  status.setSocketLoaded();
  notificationService.setIoInstance(io);

  // Stream all telemetry events to admin:telemetry subscribers
  const eventBus = require('./telemetry/eventBus');
  eventBus.subscribe((event) => {
    if (io) {
      io.to('admin:telemetry').emit('admin:telemetry:event', event);
    }
  });

  // ─── 1. Authentication Middleware ───────────────────────────────────────
  // Runs during handshake before 'connection' event
  io.use((socket, next) => auth.authenticateSocket(socket, next));

  // ─── 2. Setup Redis Adapter (for multi-instance deployments) ────────────
  if (isVercel) {
    status.setRedisConnected(false);
    console.log('   [Redis] Vercel mode: distributed adapter disabled for stateless Socket.IO');
  } else {
    const hasRedisConfig = Boolean(process.env.REDIS_URL);

    if (hasRedisConfig) {
      try {
        const pubClient = getRedisSingleton();
        redisClientInstance = pubClient;
        const DistributedLock = require('./core/distributedLock');
        DistributedLock.setRedisClient(pubClient);

        // All connection ready/close/error listeners are centralized in redisEventBridge.js

        const subClient = getRedisSubClient();

        io.adapter(createAdapter(pubClient, subClient));
      } catch (err) {
        console.log('   [Redis] Initialization skipped - running in-memory Socket.IO mode');
        status.setRedisConnected(false);
      }
    } else {
      console.log('   [Redis] Not configured - running in-memory Socket.IO mode');
      status.setRedisConnected(false);
    }
  }

  // ─── 3.5 Presence Heartbeat Sweep (every 10 seconds) ────────────────────
  // Detects stale user sockets and prunes inactive connections
  setInterval(() => {
    const now = Date.now();
    const timeoutLimit = 30000; // 30 seconds stale timeout limit
    
    onlineUsers.forEach((user, socketId) => {
      if (user.lastSeen && now - user.lastSeen > timeoutLimit) {
        console.warn(`[Presence Sweep] Stale socket detected: ${socketId} (User: ${user.userId}). Pruning.`);
        
        // Audit presence disconnect
        logAuditEvent({
          action: 'presence_disconnect',
          userId: user.userId,
          resource: `socket:${socketId}`,
          success: true,
          metadata: { reason: 'stale_heartbeat_timeout' },
        });

        const staleSocket = io.sockets.sockets.get(socketId);
        if (staleSocket) {
          staleSocket.disconnect(true);
        } else {
          // Fallback manual cleanup
          onlineUsers.delete(socketId);
          const stillOnline = Array.from(onlineUsers.values()).some((u) => u.userId === user.userId);
          if (!stillOnline) {
            onlineUsersByUserId.delete(user.userId);
          }
          io.emit(config.SERVER_EVENTS.GLOBAL_STATS, { onlineCount: onlineUsers.size });
          const onlineUsersList = Array.from(onlineUsersByUserId.values());
          io.to('global').emit(config.SERVER_EVENTS.CHAT_ONLINE_USERS, onlineUsersList);
        }
      }
    });
  }, 10000);

  // ─── 4. Connection Handler ─────────────────────────────────────────────
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    const username = socket.data.username || 'User';
    socket.user = {
      userId,
      username,
    };

    console.log(`[Socket.io] Client connected: ${socket.id} (User: ${userId})`);

    // Auto-join the global chat room for all authenticated clients
    socket.join('global');
    socket.data.rooms.add('global');
    socket.join(userId.toString()); // Join user's private notification channel

    // Setup per-socket token expiry monitoring
    auth.setupTokenExpiryTimer(socket);

    const eventBusInstance = require('./telemetry/eventBus');
    eventBusInstance.emit('socket:connect', 'info', { socketId: socket.id, username }, userId);

    // Live Observability: Track all incoming and outgoing WebSocket events and active counts
    socket.onAny((event) => {
      status.recordSocketEventReceived();
      eventBusInstance.emit('socket:incoming', 'info', { socketId: socket.id, event }, userId);
      prometheus.websocketEventsTotal.inc({ event, direction: 'incoming' });
    });
    socket.onAnyOutgoing((event) => {
      status.recordSocketEventSent();
      eventBusInstance.emit('socket:outgoing', 'info', { socketId: socket.id, event }, userId);
      prometheus.websocketEventsTotal.inc({ event, direction: 'outgoing' });
    });

    // Track user in onlineUsers
    onlineUsers.set(socket.id, {
      userId,
      username,
      roomId: null,
      status: 'online',
      lastSeen: Date.now(), // initialize presence heartbeat
    });

    status.recordSocketConnect(onlineUsers.size);

    // Track user in onlineUsersByUserId for presence
    onlineUsersByUserId.set(userId, { userId, username });

    // Emit connection success
    socket.emit(config.SERVER_EVENTS.CONNECT_SUCCESS, {
      socketId: socket.id,
      userId,
    });

    // ─── Distributed Redis Presence Tracker ─────────────────────────────────
    (async () => {
      let onlineCount = onlineUsers.size;
      if (redisClientInstance && redisClientInstance.status === 'ready') {
        try {
          await redisClientInstance.sadd('redis:online_users', userId.toString());
          onlineCount = await redisClientInstance.scard('redis:online_users');
        } catch (err) {
          // Fallback silently
        }
      }
      io.emit(config.SERVER_EVENTS.GLOBAL_STATS, { onlineCount });
    })();

    // Broadcast updated online users list to global room
    const onlineUsersList = Array.from(onlineUsersByUserId.values());
    io.to('global').emit(config.SERVER_EVENTS.CHAT_ONLINE_USERS, onlineUsersList);

    // ═══════════════════════════════════════════════════════════════════════
    // EVENT HANDLERS - All use guard() pattern
    // ═══════════════════════════════════════════════════════════════════════

    // ─── ADMIN TELEMETRY: Subscribe to real-time events stream ─────────────
    socket.on('admin:telemetry:subscribe', async (data, ack) => {
      try {
        if (!socket.data?.userId) {
          const error = { code: 'NO_TOKEN', message: 'Authentication required' };
          return ack?.(error) || socket.emit('error', error);
        }

        const { findUserById } = require('./utils/authStore');
        const user = await findUserById(socket.data.userId);
        
        if (!user || user.tier !== 'admin') {
          const error = { code: 'PERMISSION_DENIED', message: 'Admin access required for telemetry stream' };
          return ack?.(error) || socket.emit('error', error);
        }

        socket.join('admin:telemetry');
        
        const eventBusObj = require('./telemetry/eventBus');
        eventBusObj.emit('telemetry:subscribed', 'info', { socketId: socket.id, username: user.username }, user._id);

        ack?.({ success: true, message: 'Subscribed to telemetry stream' });
      } catch (err) {
        const error = { code: 'INTERNAL_ERROR', message: err.message };
        ack?.(error) || socket.emit('error', error);
      }
    });

    // ─── RE-AUTHENTICATION: Handle token refresh ──────────────────────────
    socket.on(config.CLIENT_EVENTS.SOCKET_REAUTH, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.SOCKET_REAUTH, data, ack, async () => {
        const newToken = data?.token;
        const tokenValidation = auth.verifyToken(newToken, env.getJwtSecret());

        if (tokenValidation.error) {
          throw { code: 'INVALID_TOKEN' };
        }

        const decoded = tokenValidation.decoded;

        if (decoded.sub !== socket.data.userId) {
          throw { code: 'PERMISSION_DENIED' };
        }

        if (decoded.tokenType !== 'access') {
          throw { code: 'INVALID_TOKEN' };
        }

        socket.data.tokenExpiry = decoded.exp * 1000;

        auth.clearTokenExpiryTimer(socket);
        auth.setupTokenExpiryTimer(socket);

        ack?.({ success: true });
      });
    });

    // ─── ROOM: Join room ───────────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.ROOM_JOIN, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.ROOM_JOIN, data, ack, async () => {
        await presenceService.handleRoomJoin(socket, data, ack);
      });
    });

    // ─── TIMER: Start timer ────────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.TIMER_START, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.TIMER_START, data, ack, async () => {
        await timerController.handleStart(socket, data, ack);
      });
    });

    // ─── TIMER: Pause timer ───────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.TIMER_PAUSE, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.TIMER_PAUSE, data, ack, async () => {
        await timerController.handlePause(socket, data, ack);
      });
    });

    // ─── TIMER: Resume timer ──────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.TIMER_RESUME, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.TIMER_RESUME, data, ack, async () => {
        await timerController.handleResume(socket, data, ack);
      });
    });

    // ─── TIMER: Cancel timer ──────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.TIMER_CANCEL, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.TIMER_CANCEL, data, ack, async () => {
        await timerController.handleCancel(socket, data, ack);
      });
    });

    // ─── CHAT: Send message ───────────────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.ROOM_CHAT, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.ROOM_CHAT, data, ack, async () => {
        const roomId = data.roomId;
        const rawMessage = data.message;
        const user = onlineUsers.get(socket.id);

        const message = sanitizeMessage(rawMessage);
        if (!message) {
          throw { code: 'INVALID_PAYLOAD', message: 'Message content cannot be empty after sanitization' };
        }

        const persistedMsg = await roomStore.createMessage({
          roomId,
          userId: socket.data.userId,
          username: user.username,
          message,
          type: 'chat',
        });

        logAuditEvent({
          action: 'message_persisted',
          userId: socket.data.userId,
          previousTier: socket.user?.tier,
          resource: `room:${roomId}`,
          success: true,
          metadata: { messageId: persistedMsg._id, roomId },
        });

        io.to(`room:${roomId}`).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
          type: 'chat',
          userId: socket.data.userId,
          username: user.username,
          message,
          createdAt: persistedMsg.createdAt,
          _id: persistedMsg._id,
        });

        const xpServiceInstance = require('./services/xpService');
        await xpServiceInstance.awardXp(socket.data.userId, 'ROOM_PARTICIPATION');

        ack?.({ success: true, message: persistedMsg });
      });
    });

    // ─── CHAT: Join global chat room ───────────────────────────────────────
    socket.on(config.CLIENT_EVENTS.CHAT_JOIN, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.CHAT_JOIN, data, ack, async () => {
        const roomName = data?.roomId || 'global';
        if (roomName !== 'global') {
          throw { code: 'INVALID_PAYLOAD', message: 'Only global chat is supported' };
        }

        socket.join('global');
        socket.data.rooms.add('global');

        ack?.({ success: true, roomId: 'global' });
      });
    });

    // ─── CHAT: Global chat message broadcast ───────────────────────────────
    socket.on(config.CLIENT_EVENTS.CHAT_MESSAGE, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.CHAT_MESSAGE, data, ack, async () => {
        const message = String(data?.message || '').trim();
        if (!message) {
          throw { code: 'INVALID_PAYLOAD', message: 'Message is required' };
        }

        const chatMessage = buildChatMessage({
          userId: socket.user.userId,
          username: socket.user.username,
          message,
          room: 'global',
        });

        io.to('global').emit(config.SERVER_EVENTS.CHAT_MESSAGE, chatMessage);
        ack?.({ success: true, message: chatMessage });
      });
    });

    // ─── PRESENCE: Heartbeat ping ──────────────────────────────────────────
    socket.on('presence:heartbeat', (data, ack) => {
      const user = onlineUsers.get(socket.id);
      if (user) {
        user.lastSeen = Date.now();
        if (data && data.status) {
          user.status = data.status;
        }
        onlineUsers.set(socket.id, user);
      }
      ack?.({ success: true });
    });

    // ─── TYPING: Typing indicators (start/stop) ────────────────────────────
    socket.on('room:typing:start', (data, ack) => {
      const roomId = data?.roomId;
      if (!roomId) return ack?.({ success: false, error: 'ROOM_REQUIRED' });

      const user = onlineUsers.get(socket.id);
      if (!user || user.roomId !== roomId) {
        return ack?.({ success: false, error: 'NOT_ROOM_MEMBER' });
      }

      if (activeTypingUsers.has(socket.id)) {
        clearTimeout(activeTypingUsers.get(socket.id));
      } else {
        socket.to(`room:${roomId}`).emit('room:user-typing', {
          roomId,
          userId: socket.user.userId,
          username: socket.user.username,
          typing: true,
        });
      }

      const timeout = setTimeout(() => {
        activeTypingUsers.delete(socket.id);
        socket.to(`room:${roomId}`).emit('room:user-typing', {
          roomId,
          userId: socket.user.userId,
          username: socket.user.username,
          typing: false,
        });
      }, 5000);

      activeTypingUsers.set(socket.id, timeout);
      ack?.({ success: true });
    });

    socket.on('room:typing:stop', (data, ack) => {
      const roomId = data?.roomId;
      if (!roomId) return ack?.({ success: false, error: 'ROOM_REQUIRED' });

      if (activeTypingUsers.has(socket.id)) {
        clearTimeout(activeTypingUsers.get(socket.id));
        activeTypingUsers.delete(socket.id);
        socket.to(`room:${roomId}`).emit('room:user-typing', {
          roomId,
          userId: socket.user.userId,
          username: socket.user.username,
          typing: false,
        });
      }
      ack?.({ success: true });
    });

    // ─── RECEIPTS: Message receipts ────────────────────────────────────────
    socket.on('message:delivered', async (data, ack) => {
      const { roomId, messageId } = data || {};
      if (!messageId || !roomId) return ack?.({ success: false, error: 'INVALID_PAYLOAD' });

      await roomStore.markMessageDelivered(messageId, socket.user.userId);
      ack?.({ success: true });
    });

    socket.on('message:seen', async (data, ack) => {
      const { roomId, messageId } = data || {};
      if (!messageId || !roomId) return ack?.({ success: false, error: 'INVALID_PAYLOAD' });

      await roomStore.markMessageSeen(messageId, socket.user.userId);
      
      io.to(`room:${roomId}`).emit('room:message-seen', {
        roomId,
        messageId,
        userId: socket.user.userId,
        seenAt: new Date().toISOString(),
      });

      ack?.({ success: true });
    });

    // ─── TYPING: Legacy Typing indicator compatibility ────────────────────
    socket.on(config.CLIENT_EVENTS.ROOM_TYPING, (data, ack) => {
      guard(socket, config.CLIENT_EVENTS.ROOM_TYPING, data, ack, async () => {
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
      presenceService.handleDisconnect(socket);
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

/**
 * Get shared Redis client instance
 */
const getRedisClient = () => {
  return redisClientInstance;
};

module.exports = { initSocket, getIO, getRedisClient };
