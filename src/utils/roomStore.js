// src/utils/roomStore.js
// Dynamic storage abstraction for Rooms and Messages with automatic, safe MongoDB fallback

const mongoose = require('mongoose');
const Room = require('../models/Room');
const RoomMessage = require('../models/RoomMessage');

// In-memory data structures for fallback storage when MongoDB is offline
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
 * Create a new study/chat room.
 * 
 * @param {object} param0 - Room parameters
 * @param {string} param0.name - Display name of room
 * @param {string} param0.slug - Unique url-friendly slug
 * @param {string} param0.ownerId - User ID of the owner/creator
 * @param {string} [param0.tierRequired='free'] - Minimum required plan tier
 * @param {boolean} [param0.isPrivate=false] - Whether room is private
 * @returns {Promise<object>} Created room object
 */
async function createRoom({ name, slug, ownerId, tierRequired = 'free', isPrivate = false }) {
  const normSlug = String(slug).trim().toLowerCase();

  if (isDbAvailable()) {
    try {
      // In MongoDB, the creator is added as the initial member
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
 * 
 * @param {string} id - The room identifier
 * @returns {Promise<object|null>}
 */
async function findRoomById(id) {
  if (!id) return null;
  const idStr = id.toString();

  if (isDbAvailable()) {
    try {
      const room = await Room.findById(idStr);
      if (room) return room;
    } catch (error) {
      console.warn('[RoomStore] Room findById query failed, falling back to memory search...');
    }
  }

  return inMemoryRooms.get(idStr) || null;
}

/**
 * Find room config by its unique slug.
 * 
 * @param {string} slug - The url slug key
 * @returns {Promise<object|null>}
 */
async function findRoomBySlug(slug) {
  if (!slug) return null;
  const normSlug = String(slug).trim().toLowerCase();

  if (isDbAvailable()) {
    try {
      const room = await Room.findOne({ slug: normSlug });
      if (room) return room;
    } catch (error) {
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
 * 
 * @returns {Promise<Array>} List of public rooms
 */
async function findRooms() {
  if (isDbAvailable()) {
    try {
      const rooms = await Room.find({ isPrivate: false }).sort({ createdAt: -1 });
      return rooms;
    } catch (error) {
      console.warn('[RoomStore] Rooms find query failed, falling back to memory query...');
    }
  }

  const list = [];
  for (const r of inMemoryRooms.values()) {
    if (!r.isPrivate) {
      list.push(r);
    }
  }

  // Sort by createdAt descending
  return list.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Count how many rooms are currently owned/created by a specific user.
 * Used for enforcing monetization tier limits.
 * 
 * @param {string} ownerId - Owner's user ID
 * @returns {Promise<number>} Number of owned rooms
 */
async function countRoomsByOwnerId(ownerId) {
  if (!ownerId) return 0;
  const ownerStr = ownerId.toString();

  if (isDbAvailable()) {
    try {
      const count = await Room.countDocuments({ ownerId: ownerStr });
      return count;
    } catch (error) {
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
 * 
 * @param {string} roomId - Room identifier
 * @param {string} userId - User identifier to append
 * @returns {Promise<object|null>} The updated room instance
 */
async function addMemberToRoom(roomId, userId) {
  if (!roomId || !userId) return null;
  const roomStr = roomId.toString();
  const userStr = userId.toString();

  if (isDbAvailable()) {
    try {
      const room = await Room.findByIdAndUpdate(
        roomStr,
        { $addToSet: { members: userId } },
        { new: true }
      );
      if (room) return room;
    } catch (error) {
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
 * 
 * @param {object} param0 - Message parameters
 * @param {string} param0.roomId - Room identifier
 * @param {string} param0.userId - Message author's user ID
 * @param {string} param0.username - Username of author
 * @param {string} param0.message - Clean sanitized message content
 * @param {string} [param0.type='chat'] - Message type key (chat or system)
 * @returns {Promise<object>} Persisted message object
 */
async function createMessage({ roomId, userId, username, message, type = 'chat' }) {
  const cleanMessage = String(message).trim();

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
 * 
 * @param {string} roomId - Room identifier
 * @param {number} [limit=50] - Number of historical items to retrieve
 * @returns {Promise<Array>}
 */
async function findMessagesByRoomId(roomId, limit = 50) {
  if (!roomId) return [];
  const roomStr = roomId.toString();

  if (isDbAvailable()) {
    try {
      const messages = await RoomMessage.find({ roomId: roomStr })
        .sort({ createdAt: -1 })
        .limit(limit);
      
      // Mongoose returns newest first when sorted by -1. We reverse to keep chronological order
      return messages.reverse();
    } catch (error) {
      console.warn('[RoomStore] Message history DB query failed, falling back to memory scan...');
    }
  }

  // Search in memory messages
  const filtered = inMemoryMessages.filter((msg) => msg.roomId === roomStr);
  
  // Take the last N messages (filtered is naturally chronological)
  const chunk = filtered.slice(-limit);
  return chunk;
}

/**
 * Manually update and save a room configuration.
 * 
 * @param {object} room - The room object
 * @returns {Promise<object>}
 */
async function saveRoom(room) {
  if (!room || !room._id) return null;
  const idStr = room._id.toString();

  if (isDbAvailable() && typeof room.save === 'function') {
    try {
      const saved = await room.save();
      return saved;
    } catch (error) {
      console.warn('[RoomStore] Room DB save() failed, syncing fallback store...');
    }
  }

  // Update in memory map
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

  if (isDbAvailable()) {
    try {
      const RoomMessage = require('../models/RoomMessage');
      await RoomMessage.findByIdAndUpdate(msgStr, { $addToSet: { deliveredTo: userStr } });
    } catch (e) {
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

  if (isDbAvailable()) {
    try {
      const RoomMessage = require('../models/RoomMessage');
      await RoomMessage.findByIdAndUpdate(msgStr, { $addToSet: { seenBy: userStr } });
    } catch (e) {
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
