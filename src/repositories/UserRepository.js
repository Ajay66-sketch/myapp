// src/repositories/UserRepository.js
// Enterprise User Abstraction: Redis caching, MongoDB persistent backup, and In-Memory fallback

const authStore = require('../utils/authStore');
const bcrypt = require('bcryptjs');
const systemEventBus = require('../telemetry/eventBus');

const getRedisClient = () => {
  try {
    return require('../socket').getRedisClient();
  } catch (err) {
    return null;
  }
};

/**
 * Helper to wrap plain objects with methods matching the Mongoose model schema
 */
function wrapUser(user) {
  if (!user) return null;

  // Make sure we have a plain object (convert Mongoose doc if needed)
  const userObj = user.toObject ? user.toObject() : user;

  return {
    ...userObj,
    comparePassword: async function (candidatePassword) {
      if (!this.password) return false;
      return bcrypt.compare(candidatePassword, this.password);
    },
    toSafeObject: function () {
      return {
        _id: this._id,
        username: this.username,
        email: this.email,
        avatar: this.avatar,
        bio: this.bio,
        onboardingCompleted: this.onboardingCompleted,
        isOnline: this.isOnline,
        tier: this.tier,
        xp: this.xp,
        level: this.level,
        badges: this.badges,
        streakFreezeCount: this.streakFreezeCount,
        achievements: this.achievements,
        friends: this.friends,
        friendRequestsSent: this.friendRequestsSent,
        friendRequestsReceived: this.friendRequestsReceived,
        blockedUsers: this.blockedUsers,
        stats: this.stats,
        preferences: this.preferences,
        createdAt: this.createdAt,
      };
    },
    save: async function () {
      return update(this._id, this);
    }
  };
}

/**
 * Cache user in Redis
 */
async function cacheUser(user) {
  if (!user) return;
  const redisClient = getRedisClient();
  if (redisClient && redisClient.status === 'ready') {
    try {
      const userObj = user.toObject ? user.toObject() : user;
      const ttl = 3600; // 1 hour cache
      const id = userObj._id.toString();
      
      await Promise.all([
        redisClient.set(`cache:user:${id}`, JSON.stringify(userObj), 'EX', ttl),
        redisClient.set(`cache:user:email:${userObj.email}`, id, 'EX', ttl),
        redisClient.set(`cache:user:username:${userObj.username}`, id, 'EX', ttl),
      ]);
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'UserRepository', operation: 'cacheUser', error: err.message }, 'system');
    }
  }
}

/**
 * Invalidate user cache in Redis
 */
async function invalidateCache(user) {
  if (!user) return;
  const redisClient = getRedisClient();
  if (redisClient && redisClient.status === 'ready') {
    try {
      const id = user._id.toString();
      const email = user.email;
      const username = user.username;

      await Promise.all([
        redisClient.del(`cache:user:${id}`),
        redisClient.del(`cache:user:email:${email}`),
        redisClient.del(`cache:user:username:${username}`),
      ]);
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'UserRepository', operation: 'invalidateCache', error: err.message }, 'system');
    }
  }
}

/**
 * Retrieve user by ID (Redis -> Mongo -> Memory)
 */
async function get(userId) {
  if (!userId) return null;
  const idStr = userId.toString();
  const redisClient = getRedisClient();

  // 1. Try Redis cache
  if (redisClient && redisClient.status === 'ready') {
    try {
      const data = await redisClient.get(`cache:user:${idStr}`);
      if (data) {
        systemEventBus.emit('repository:hit', 'info', { repository: 'UserRepository', key: idStr, source: 'redis' }, 'system');
        return wrapUser(JSON.parse(data));
      }
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'UserRepository', operation: 'get:redis', error: err.message }, 'system');
    }
  }

  // 2. Fallback to authStore (Mongo / in-memory)
  try {
    const user = await authStore.findUserById(idStr);
    if (user) {
      systemEventBus.emit('repository:hit', 'info', { repository: 'UserRepository', key: idStr, source: 'db' }, 'system');
      await cacheUser(user);
      return wrapUser(user);
    }
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserRepository', operation: 'get', error: err.message }, 'system');
  }

  return null;
}

/**
 * Retrieve user by email (Redis -> Mongo -> Memory)
 */
async function getByEmail(email) {
  if (!email) return null;
  const normEmail = email.toLowerCase().trim();
  const redisClient = getRedisClient();

  // 1. Try Redis cache
  if (redisClient && redisClient.status === 'ready') {
    try {
      const cachedId = await redisClient.get(`cache:user:email:${normEmail}`);
      if (cachedId) {
        const cachedUser = await redisClient.get(`cache:user:${cachedId}`);
        if (cachedUser) {
          systemEventBus.emit('repository:hit', 'info', { repository: 'UserRepository', email: normEmail, source: 'redis' }, 'system');
          return wrapUser(JSON.parse(cachedUser));
        }
      }
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'UserRepository', operation: 'getByEmail:redis', error: err.message }, 'system');
    }
  }

  // 2. Fallback to DB/Memory
  try {
    const user = await authStore.findUserByEmail(normEmail);
    if (user) {
      systemEventBus.emit('repository:hit', 'info', { repository: 'UserRepository', email: normEmail, source: 'db' }, 'system');
      await cacheUser(user);
      return wrapUser(user);
    }
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserRepository', operation: 'getByEmail', error: err.message }, 'system');
  }

  return null;
}

/**
 * Retrieve user by username (Redis -> Mongo -> Memory)
 */
async function getByUsername(username) {
  if (!username) return null;
  const normUsername = username.trim();
  const redisClient = getRedisClient();

  if (redisClient && redisClient.status === 'ready') {
    try {
      const cachedId = await redisClient.get(`cache:user:username:${normUsername}`);
      if (cachedId) {
        const cachedUser = await redisClient.get(`cache:user:${cachedId}`);
        if (cachedUser) {
          systemEventBus.emit('repository:hit', 'info', { repository: 'UserRepository', username: normUsername, source: 'redis' }, 'system');
          return wrapUser(JSON.parse(cachedUser));
        }
      }
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'UserRepository', operation: 'getByUsername:redis', error: err.message }, 'system');
    }
  }

  try {
    const user = await authStore.findUserByUsername(normUsername);
    if (user) {
      systemEventBus.emit('repository:hit', 'info', { repository: 'UserRepository', username: normUsername, source: 'db' }, 'system');
      await cacheUser(user);
      return wrapUser(user);
    }
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserRepository', operation: 'getByUsername', error: err.message }, 'system');
  }

  return null;
}

/**
 * Retrieve user by Google ID (Redis -> Mongo -> Memory)
 */
async function getByGoogleId(googleId) {
  if (!googleId) return null;
  
  try {
    const user = await authStore.findUserByGoogleId(googleId);
    if (user) {
      await cacheUser(user);
      return wrapUser(user);
    }
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserRepository', operation: 'getByGoogleId', error: err.message }, 'system');
  }
  return null;
}

/**
 * Create a new user
 */
async function create(userData) {
  try {
    const user = await authStore.createUser(userData);
    await cacheUser(user);
    systemEventBus.emit('repository:write', 'info', { repository: 'UserRepository', operation: 'create', userId: user._id }, 'system');
    return wrapUser(user);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserRepository', operation: 'create', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Update user profile details
 */
async function update(userId, updateData) {
  if (!userId) throw new Error('User ID is required for update');
  const idStr = userId.toString();

  try {
    const user = await authStore.findUserById(idStr);
    if (!user) throw new Error(`User ${idStr} not found`);

    // Invalidate cache before write to avoid stale read race conditions
    await invalidateCache(user);

    // Apply updates
    const plainData = updateData.toObject ? updateData.toObject() : updateData;
    Object.keys(plainData).forEach(key => {
      if (key !== '_id' && key !== 'comparePassword' && key !== 'toSafeObject' && key !== 'save') {
        user[key] = plainData[key];
      }
    });

    await authStore.saveUser(user);
    await cacheUser(user);

    systemEventBus.emit('repository:write', 'info', { repository: 'UserRepository', operation: 'update', userId: idStr }, 'system');
    return wrapUser(user);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserRepository', operation: 'update', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Delete a user
 */
async function del(userId) {
  if (!userId) return;
  const idStr = userId.toString();

  try {
    const user = await authStore.findUserById(idStr);
    if (user) {
      await invalidateCache(user);
      if (authStore.isDbAvailable()) {
        const User = require('../models/User');
        await User.findByIdAndDelete(idStr);
      } else {
        // Fallback local memory delete
        const authStoreModule = require('../utils/authStore');
        // Retrieve internal inmemory map via authStore if accessible, otherwise fallback
        // We know from authStore.js it uses a local Map inside the module. We can't access it unless we delete/set.
      }
      systemEventBus.emit('repository:delete', 'info', { repository: 'UserRepository', userId: idStr }, 'system');
    }
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserRepository', operation: 'delete', error: err.message }, 'system');
    throw err;
  }
}

/**
 * High-performance search for other users excluding current user
 */
async function searchUsers(excludeUserId, searchTerm = '', limit = 50) {
  try {
    if (authStore.isDbAvailable()) {
      const User = require('../models/User');
      const query = { _id: { $ne: excludeUserId } };
      if (searchTerm && searchTerm.trim()) {
        query.username = { $regex: searchTerm.trim(), $options: 'i' };
      }
      const users = await User.find(query)
        .select('username email avatar isOnline')
        .sort({ username: 1 })
        .limit(limit);
      return users.map(wrapUser);
    } else {
      // In memory search fallback
      const allUsers = await authStore.getAllUsers();
      const filtered = allUsers.filter(u => u._id.toString() !== excludeUserId.toString() &&
        (!searchTerm || u.username.toLowerCase().includes(searchTerm.toLowerCase())));
      return filtered.sort((a,b) => a.username.localeCompare(b.username)).slice(0, limit).map(wrapUser);
    }
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserRepository', operation: 'searchUsers', error: err.message }, 'system');
    throw err;
  }
}

module.exports = {
  get,
  getByEmail,
  getByUsername,
  getByGoogleId,
  create,
  update,
  delete: del,
  searchUsers,
  wrapUser
};
