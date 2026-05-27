const monetizationPermissions = require('../../utils/permissions');
const RoomRepository = require('../../repositories/RoomRepository');
const UserRepository = require('../../repositories/UserRepository');
const { logAuditEvent } = require('../../utils/auditLogger');
const config = require('../config');
const permissions = require('../permissions');
const rateLimiter = require('../rateLimiter');
const auth = require('../auth');
const status = require('../../config/status');
const coreEventBus = require('../../core/eventBus');
const AnalyticsService = require('../../services/analyticsService');

const onlineUsers = new Map(); // socket.id -> { userId, username, roomId, status, lastSeen }
const roomsState = new Map(); // roomId -> { timer: {...}, participants: Set }
const onlineUsersByUserId = new Map(); // userId -> { userId, username }
const activeTypingUsers = new Map(); // socket.id -> Timeout

const getIO = () => require('../../socket').getIO();
const getRedisClient = () => require('../../socket').getRedisClient();

/**
 * Handle client joining a study room
 */
async function handleRoomJoin(socket, data, ack) {
  const io = getIO();
  const roomId = data.roomId;
  const user = onlineUsers.get(socket.id);

  if (!user) {
    throw { code: 'PERMISSION_DENIED', message: 'User presence profile not found' };
  }

  // ─── Monetization Premium Room Check ─────────────────────────────────
  const roomObj = await RoomRepository.get(roomId);
  if (roomObj && roomObj.tierRequired === 'pro') {
    const freshUser = await UserRepository.get(socket.data.userId);
    const plan = monetizationPermissions.getPlan(freshUser);
    if (plan.id === 'free') {
      logAuditEvent({
        action: 'feature_access_denied',
        userId: socket.data.userId,
        previousTier: freshUser?.tier || 'free',
        resource: `socket:room:join:${roomId}`,
        success: false,
        metadata: { reason: 'Premium room join via socket blocked' },
      });
      throw { code: 'PERMISSION_DENIED', message: 'Pro subscription required to join this premium room' };
    }
  }

  // Leave previous room if in one
  if (user.roomId) {
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
      
      coreEventBus.emit('presence:room_left', { socket, userId: socket.data.userId, roomId: user.roomId });
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
        startSent: false,
        midSent: false,
        completeSent: false,
        lastMotivationalMin: null,
      },
      participants: new Set(),
    });
  }

  const room = roomsState.get(roomId);
  room.participants.add(socket.id);

  // Fetch history
  const lastMessages = await RoomRepository.findMessages(roomId, 50);

  // Sync state to joining client
  socket.emit(config.SERVER_EVENTS.ROOM_STATE, {
    timer: room.timer,
    participants: Array.from(room.participants).map((id) => ({
      socketId: id,
      ...onlineUsers.get(id),
    })),
    messages: lastMessages,
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

  logAuditEvent({
    action: 'room_joined',
    userId: socket.data.userId,
    previousTier: socket.user?.tier,
    resource: `room:${roomId}`,
    success: true,
    metadata: { roomId },
  });

  // Track room joining in PostHog
  AnalyticsService.track('room_joined', socket.data.userId, { roomId });

  coreEventBus.emit('presence:room_joined', { socket, userId: socket.data.userId, roomId });

  ack?.({ success: true, roomId, messages: lastMessages });
}

/**
 * Handle socket disconnection cleanup
 */
async function handleDisconnect(socket) {
  const io = getIO();
  const redisClientInstance = getRedisClient();
  const user = onlineUsers.get(socket.id);

  // Clear typing timeouts
  if (activeTypingUsers.has(socket.id)) {
    clearTimeout(activeTypingUsers.get(socket.id));
    activeTypingUsers.delete(socket.id);
  }

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

      coreEventBus.emit('presence:room_left', { socket, userId: socket.data.userId, roomId: user.roomId });

      // Clean empty rooms
      if (room.participants.size === 0) {
        roomsState.delete(user.roomId);
      }
    }

    permissions.trackRoomLeave(socket, user.roomId);
  }

  // General Cleanups
  rateLimiter.resetUserLimits(socket.data.userId);
  auth.clearTokenExpiryTimer(socket);

  onlineUsers.delete(socket.id);
  status.recordSocketDisconnect(onlineUsers.size);

  coreEventBus.emit('socket:disconnect', { socket, userId: socket.data.userId, username: user?.username || 'User' });

  // Presence check
  const userStillOnline = Array.from(onlineUsers.values()).some(
    (u) => u.userId === user?.userId
  );

  if (!userStillOnline && user?.userId) {
    onlineUsersByUserId.delete(user.userId);
  }

  // Update stats & publish globally
  let onlineCount = onlineUsers.size;
  if (redisClientInstance && redisClientInstance.status === 'ready' && user?.userId) {
    try {
      if (!userStillOnline) {
        await redisClientInstance.srem('redis:online_users', user.userId.toString());
      }
      onlineCount = await redisClientInstance.scard('redis:online_users');
    } catch (err) {
      // Fallback
    }
  }

  io.emit(config.SERVER_EVENTS.GLOBAL_STATS, { onlineCount });

  const onlineUsersList = Array.from(onlineUsersByUserId.values());
  io.to('global').emit(config.SERVER_EVENTS.CHAT_ONLINE_USERS, onlineUsersList);

  console.log(`[PresenceService] Client disconnected: ${socket.id} (User: ${socket.data.userId})`);
}

module.exports = {
  onlineUsers,
  roomsState,
  onlineUsersByUserId,
  activeTypingUsers,
  handleRoomJoin,
  handleDisconnect
};
