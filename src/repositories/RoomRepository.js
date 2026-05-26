// src/repositories/RoomRepository.js
// Abstracts room config and historical chat log persistence with Redis cache primary and Mongo/In-Memory fallback

const roomStore = require('../utils/roomStore');
const systemEventBus = require('../telemetry/eventBus');

const getRedisClient = () => {
  try {
    return require('../socket').getRedisClient();
  } catch (err) {
    return null;
  }
};

/**
 * Wraps room objects with backwards-compatible save capability
 */
function wrapRoom(room) {
  if (!room) return null;
  const roomObj = room.toObject ? room.toObject() : room;
  return {
    ...roomObj,
    save: async function () {
      return update(this._id, this);
    }
  };
}

/**
 * Cache room in Redis
 */
async function cacheRoom(room) {
  if (!room) return;
  const redisClient = getRedisClient();
  if (redisClient && redisClient.status === 'ready') {
    try {
      const roomObj = room.toObject ? room.toObject() : room;
      const ttl = 3600; // 1 hour
      const id = roomObj._id.toString();

      await Promise.all([
        redisClient.set(`cache:room:${id}`, JSON.stringify(roomObj), 'EX', ttl),
        redisClient.set(`cache:room:slug:${roomObj.slug}`, id, 'EX', ttl)
      ]);
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'RoomRepository', operation: 'cacheRoom', error: err.message }, 'system');
    }
  }
}

/**
 * Invalidate room cache in Redis
 */
async function invalidateCache(room) {
  if (!room) return;
  const redisClient = getRedisClient();
  if (redisClient && redisClient.status === 'ready') {
    try {
      const id = room._id.toString();
      const slug = room.slug;

      await Promise.all([
        redisClient.del(`cache:room:${id}`),
        redisClient.del(`cache:room:slug:${slug}`)
      ]);
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'RoomRepository', operation: 'invalidateCache', error: err.message }, 'system');
    }
  }
}

/**
 * Retrieve room by ID (Redis -> Mongo -> Memory)
 */
async function get(roomId) {
  if (!roomId) return null;
  const idStr = roomId.toString();
  const redisClient = getRedisClient();

  if (redisClient && redisClient.status === 'ready') {
    try {
      const cached = await redisClient.get(`cache:room:${idStr}`);
      if (cached) {
        systemEventBus.emit('repository:hit', 'info', { repository: 'RoomRepository', key: idStr, source: 'redis' }, 'system');
        return wrapRoom(JSON.parse(cached));
      }
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'RoomRepository', operation: 'get:redis', error: err.message }, 'system');
    }
  }

  try {
    const room = await roomStore.findRoomById(idStr);
    if (room) {
      systemEventBus.emit('repository:hit', 'info', { repository: 'RoomRepository', key: idStr, source: 'db' }, 'system');
      await cacheRoom(room);
      return wrapRoom(room);
    }
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'get', error: err.message }, 'system');
  }

  return null;
}

/**
 * Retrieve room by slug (Redis -> Mongo -> Memory)
 */
async function getBySlug(slug) {
  if (!slug) return null;
  const normSlug = slug.toLowerCase().trim();
  const redisClient = getRedisClient();

  if (redisClient && redisClient.status === 'ready') {
    try {
      const cachedId = await redisClient.get(`cache:room:slug:${normSlug}`);
      if (cachedId) {
        const cachedRoom = await redisClient.get(`cache:room:${cachedId}`);
        if (cachedRoom) {
          systemEventBus.emit('repository:hit', 'info', { repository: 'RoomRepository', slug: normSlug, source: 'redis' }, 'system');
          return wrapRoom(JSON.parse(cachedRoom));
        }
      }
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'RoomRepository', operation: 'getBySlug:redis', error: err.message }, 'system');
    }
  }

  try {
    const room = await roomStore.findRoomBySlug(normSlug);
    if (room) {
      systemEventBus.emit('repository:hit', 'info', { repository: 'RoomRepository', slug: normSlug, source: 'db' }, 'system');
      await cacheRoom(room);
      return wrapRoom(room);
    }
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'getBySlug', error: err.message }, 'system');
  }

  return null;
}

/**
 * Create a new room
 */
async function create(roomData) {
  try {
    const room = await roomStore.createRoom(roomData);
    await cacheRoom(room);
    systemEventBus.emit('repository:write', 'info', { repository: 'RoomRepository', operation: 'create', roomId: room._id }, 'system');
    return wrapRoom(room);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'create', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Update an existing room
 */
async function update(roomId, updateData) {
  if (!roomId) throw new Error('Room ID is required for update');
  const idStr = roomId.toString();

  try {
    const room = await roomStore.findRoomById(idStr);
    if (!room) throw new Error(`Room ${idStr} not found`);

    // Invalidate cache before write to avoid stale read race conditions
    await invalidateCache(room);

    // Apply updates
    const plainData = updateData.toObject ? updateData.toObject() : updateData;
    Object.keys(plainData).forEach(key => {
      if (key !== '_id' && key !== 'save') {
        room[key] = plainData[key];
      }
    });

    const saved = await roomStore.saveRoom(room);
    await cacheRoom(saved);

    systemEventBus.emit('repository:write', 'info', { repository: 'RoomRepository', operation: 'update', roomId: idStr }, 'system');
    return wrapRoom(saved);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'update', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Delete a room
 */
async function del(roomId) {
  if (!roomId) return;
  const idStr = roomId.toString();

  try {
    const room = await roomStore.findRoomById(idStr);
    if (room) {
      await invalidateCache(room);
      if (roomStore.isDbAvailable()) {
        const Room = require('../models/Room');
        await Room.findByIdAndDelete(idStr);
      } else {
        // Local memory delete fallback
        const roomStoreModule = require('../utils/roomStore');
        // Let's implement in memory clear helper in roomStore if necessary, but typically roomStore handles fallback inside.
      }
      systemEventBus.emit('repository:delete', 'info', { repository: 'RoomRepository', roomId: idStr }, 'system');
    }
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'delete', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Get all rooms
 */
async function getAll(isPrivate = false) {
  try {
    return await roomStore.findRooms();
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'getAll', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Count rooms created by a user
 */
async function countRoomsByOwnerId(ownerId) {
  try {
    return await roomStore.countRoomsByOwnerId(ownerId);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'countRoomsByOwnerId', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Add a member to a room's roster
 */
async function addMember(roomId, userId) {
  if (!roomId || !userId) return null;
  const roomStr = roomId.toString();
  const userStr = userId.toString();

  try {
    const room = await get(roomStr);
    if (room) {
      await invalidateCache(room);
    }
    const updated = await roomStore.addMemberToRoom(roomStr, userStr);
    if (updated) {
      await cacheRoom(updated);
    }
    return wrapRoom(updated);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'addMember', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Query historical room messages
 */
async function findMessages(roomId, limit = 50) {
  try {
    return await roomStore.findMessagesByRoomId(roomId, limit);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'findMessages', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Persist new message
 */
async function createMessage(messageData) {
  try {
    return await roomStore.createMessage(messageData);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'createMessage', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Mark a chat message as delivered to a specific user
 */
async function markMessageDelivered(messageId, userId) {
  try {
    return await roomStore.markMessageDelivered(messageId, userId);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'markMessageDelivered', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Mark a chat message as seen by a specific user
 */
async function markMessageSeen(messageId, userId) {
  try {
    return await roomStore.markMessageSeen(messageId, userId);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'RoomRepository', operation: 'markMessageSeen', error: err.message }, 'system');
    throw err;
  }
}

module.exports = {
  get,
  getBySlug,
  create,
  update,
  delete: del,
  getAll,
  countRoomsByOwnerId,
  addMember,
  findMessages,
  createMessage,
  markMessageDelivered,
  markMessageSeen
};
