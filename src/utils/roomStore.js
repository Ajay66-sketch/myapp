// src/utils/roomStore.js
// Dynamic storage abstraction for Rooms and Messages with strict production fail-safe constraints
// Hardened to completely forbid split-brain in-memory fallbacks in production and staging environments

const mongoose = require('mongoose');
const Room = require('../models/Room');
const RoomMessage = require('../models/RoomMessage');

// In-memory data structures for fallback storage when MongoDB is offline (development/testing only)
const inMemoryRooms = new Map();     // key: roomId (string), value: Room object
const inMemoryMessages = [];         // Array of Message objects

/**
 * Verify if MongoDB database connectivity is established and active.
 * 
 * @returns {boolean} True if MongoDB is connected
 */
function isDbAvailable() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

/**
 * Verify if the application is running in production or staging mode.
 */
function isProductionOrStaging() {
  return process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
}

/**
 * Enforce database availability in production/staging.
 */
function assertDatabaseAvailable(operationName) {
  if (isProductionOrStaging()) {
    if (!isDbAvailable()) {
      throw new Error(`❌ DATABASE CONNECTION OUTAGE: Operation '${operationName}' aborted. MongoDB is offline in production/staging.`);
    }
  }
}

/**
 * Create a new study/chat room.
 */
async function createRoom({ name, slug, ownerId, tierRequired = 'free', isPrivate = false }) {
  const normSlug = String(slug).trim().toLowerCase();

  assertDatabaseAvailable('createRoom');

  if (isDbAvailable()) {
    try {
      const room = await Room.create({
        name: name.trim(),
        slug: normSlug,
        ownerId,
        tierRequired,
        isPrivate: !!isPrivate,
        members: [ownerId],
      });
      return room;
    } catch (error) {
      if (isProductionOrStaging()) {
        throw error; // Propagate database constraint/validation errors directly in production/staging
      }
      console.warn('[RoomStore] MongoDB creation failed, trying memory fallback...', error.message);
    }
  }

  // Check unique slug uniqueness inside in-memory fallback
  for (const r of inMemoryRooms.values()) {
    if (r.slug === normSlug) {
      const err = new Error(`Slug '${normSlug}' already exists in fallback store.`);
      err.code = 11000; // Mock Mongo duplicate key error code
      throw err;
    }
  }

  const generatedId = new mongoose.Types.ObjectId().toString();
  const memoryRoom = {
    _id: generatedId,
    name: name.trim(),
    slug: normSlug,
    ownerId: ownerId.toString(),
    tierRequired,
    isPrivate: !!isPrivate,
    members: [ownerId.toString()],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  inMemoryRooms.set(generatedId, memoryRoom);
  return memoryRoom;
}

/**
 * Find room configuration by its identifier.
 */
async function findRoomById(id) {
  if (!id) return null;
  const idStr = id.toString();

  assertDatabaseAvailable('findRoomById');

  if (isDbAvailable()) {
    try {
      const room = await Room.findById(idStr);
      if (room) return room;
    } catch (error) {
      if (isProductionOrStaging()) {
        throw error;
      }
      console.warn('[RoomStore] Room findById query failed, falling back to memory search...');
    }
  }

  return inMemoryRooms.get(idStr) || null;
}

/**
 * Find room config by its unique slug.
 */
async function findRoomBySlug(slug) {
  if (!slug) return null;
  const normSlug = String(slug).trim().toLowerCase();

  assertDatabaseAvailable('findRoomBySlug');

  if (isDbAvailable()) {
    try {
      const room = await Room.findOne({ slug: normSlug });
      if (room) return room;
    } catch (error) {
      if (isProductionOrStaging()) {
        throw error;
      }
      console.warn('[RoomStore] Room findOne slug query failed, falling back to memory search...');
    }
  }

  for (const room of inMemoryRooms.values()) {
    if (room.slug === normSlug) {
      return room;
    }
  }

  return null;
}

/**
 * Query all non-private rooms.
 */
async function findRooms() {
  assertDatabaseAvailable('findRooms');

  if (isDbAvailable()) {
    try {
      const rooms = await Room.find({ isPrivate: false }).sort({ createdAt: -1 });
      return rooms;
    } catch (error) {
      if (isProductionOrStaging()) {
        throw error;
      }
      console.warn('[RoomStore] Rooms find query failed, falling back to memory query...');
    }
  }

  const list = [];
  for (const r of inMemoryRooms.values()) {
    if (!r.isPrivate) {
      list.push(r);
    }
  }

  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Count how many rooms are currently owned/created by a specific user.
 */
async function countRoomsByOwnerId(ownerId) {
  if (!ownerId) return 0;
  const ownerStr = ownerId.toString();

  assertDatabaseAvailable('countRoomsByOwnerId');

  if (isDbAvailable()) {
    try {
      const count = await Room.countDocuments({ ownerId: ownerStr });
      return count;
    } catch (error) {
      if (isProductionOrStaging()) {
        throw error;
      }
      console.warn('[RoomStore] countDocuments query failed, falling back to memory count...');
    }
  }

  let count = 0;
  for (const room of inMemoryRooms.values()) {
    if (room.ownerId === ownerStr) {
      count++;
    }
  }

  return count;
}

/**
 * Add a member user to a room's roster.
 */
async function addMemberToRoom(roomId, userId) {
  if (!roomId || !userId) return null;
  const roomStr = roomId.toString();
  const userStr = userId.toString();

  assertDatabaseAvailable('addMemberToRoom');

  if (isDbAvailable()) {
    try {
      const room = await Room.findByIdAndUpdate(
        roomStr,
        { $addToSet: { members: userId } },
        { new: true }
      );
      if (room) return room;
    } catch (error) {
      if (isProductionOrStaging()) {
        throw error;
      }
      console.warn('[RoomStore] addMemberToRoom DB update failed, trying memory update...');
    }
  }

  const room = inMemoryRooms.get(roomStr);
  if (room) {
    if (!room.members.includes(userStr)) {
      room.members.push(userStr);
      room.updatedAt = new Date();
    }
    return room;
  }

  return null;
}

/**
 * Persist a chat message inside a room.
 */
async function createMessage({ roomId, userId, username, message, type = 'chat' }) {
  const cleanMessage = String(message).trim();

  assertDatabaseAvailable('createMessage');

  if (isDbAvailable()) {
    try {
      const msg = await RoomMessage.create({
        roomId,
        userId,
        username,
        message: cleanMessage,
        type,
      });
      return msg;
    } catch (error) {
      if (isProductionOrStaging()) {
        throw error;
      }
      console.warn('[RoomStore] Message creation in DB failed, trying memory fallback...', error.message);
    }
  }

  const generatedId = new mongoose.Types.ObjectId().toString();
  const memoryMessage = {
    _id: generatedId,
    roomId: roomId.toString(),
    userId: userId.toString(),
    username,
    message: cleanMessage,
    type,
    createdAt: new Date(),
  };

  inMemoryMessages.push(memoryMessage);
  return memoryMessage;
}

/**
 * Fetch chronological historical messages for a room.
 */
async function findMessagesByRoomId(roomId, limit = 50) {
  if (!roomId) return [];
  const roomStr = roomId.toString();

  assertDatabaseAvailable('findMessagesByRoomId');

  if (isDbAvailable()) {
    try {
      const messages = await RoomMessage.find({ roomId: roomStr })
        .sort({ createdAt: -1 })
        .limit(limit);
      return messages.reverse();
    } catch (error) {
      if (isProductionOrStaging()) {
        throw error;
      }
      console.warn('[RoomStore] Message history DB query failed, falling back to memory scan...');
    }
  }

  const filtered = inMemoryMessages.filter((msg) => msg.roomId === roomStr);
  const chunk = filtered.slice(-limit);
  return chunk;
}

/**
 * Manually update and save a room configuration.
 */
async function saveRoom(room) {
  if (!room || !room._id) return null;
  const idStr = room._id.toString();

  assertDatabaseAvailable('saveRoom');

  if (isDbAvailable() && typeof room.save === 'function') {
    try {
      const saved = await room.save();
      return saved;
    } catch (error) {
      if (isProductionOrStaging()) {
        throw error;
      }
      console.warn('[RoomStore] Room DB save() failed, syncing fallback store...');
    }
  }

  const plainObj = room.toObject ? room.toObject() : room;
  plainObj.updatedAt = new Date();
  inMemoryRooms.set(idStr, plainObj);
  return plainObj;
}

/**
 * Mark a message as delivered to a specific user.
 */
async function markMessageDelivered(messageId, userId) {
  if (!messageId || !userId) return;
  const msgStr = messageId.toString();
  const userStr = userId.toString();

  assertDatabaseAvailable('markMessageDelivered');

  if (isDbAvailable()) {
    try {
      const RoomMessage = require('../models/RoomMessage');
      await RoomMessage.findByIdAndUpdate(msgStr, { $addToSet: { deliveredTo: userStr } });
    } catch (e) {
      if (isProductionOrStaging()) {
        throw e;
      }
      console.error('[RoomStore] Failed to update delivered status:', e);
    }
  } else {
    const msg = inMemoryMessages.find((m) => m._id === msgStr);
    if (msg) {
      if (!msg.deliveredTo) msg.deliveredTo = [];
      if (!msg.deliveredTo.includes(userStr)) {
        msg.deliveredTo.push(userStr);
      }
    }
  }
}

/**
 * Mark a message as seen by a specific user.
 */
async function markMessageSeen(messageId, userId) {
  if (!messageId || !userId) return;
  const msgStr = messageId.toString();
  const userStr = userId.toString();

  assertDatabaseAvailable('markMessageSeen');

  if (isDbAvailable()) {
    try {
      const RoomMessage = require('../models/RoomMessage');
      await RoomMessage.findByIdAndUpdate(msgStr, { $addToSet: { seenBy: userStr } });
    } catch (e) {
      if (isProductionOrStaging()) {
        throw e;
      }
      console.error('[RoomStore] Failed to update seen status:', e);
    }
  } else {
    const msg = inMemoryMessages.find((m) => m._id === msgStr);
    if (msg) {
      if (!msg.seenBy) msg.seenBy = [];
      if (!msg.seenBy.includes(userStr)) {
        msg.seenBy.push(userStr);
      }
    }
  }
}

/**
 * Reset and wipe all in-memory mock storage (useful during unit testing/verifications)
 */
function clearInMemoryStore() {
  inMemoryRooms.clear();
  inMemoryMessages.length = 0;
}

module.exports = {
  isDbAvailable,
  createRoom,
  findRoomById,
  findRoomBySlug,
  findRooms,
  countRoomsByOwnerId,
  addMemberToRoom,
  createMessage,
  findMessagesByRoomId,
  saveRoom,
  markMessageDelivered,
  markMessageSeen,
  clearInMemoryStore,
};
