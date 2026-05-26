// src/utils/authStore.js
// Shared auth storage helpers for MongoDB or in-memory fallback mode

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

const inMemoryUsers = new Map();
let inMemoryModeWarned = false;

const isDbAvailable = () => mongoose.connection.readyState === 1;

const warnInMemoryMode = () => {
  if (!inMemoryModeWarned) {
    console.warn('⚠️ Running auth in memory mode (dev only)');
    inMemoryModeWarned = true;
  }
};

const normalizeEmail = (email) => (email || '').toLowerCase();

const findUserByEmail = async (email) => {
  const normalizedEmail = normalizeEmail(email);

  if (isDbAvailable()) {
    return User.findOne({ email: normalizedEmail });
  }

  warnInMemoryMode();
  return Array.from(inMemoryUsers.values()).find((user) => user.email === normalizedEmail) || null;
};

const findUserById = async (id) => {
  if (isDbAvailable()) {
    return User.findById(id);
  }

  warnInMemoryMode();
  return inMemoryUsers.get(id?.toString()) || null;
};

const findUserByUsername = async (username) => {
  if (isDbAvailable()) {
    return User.findOne({ username });
  }

  warnInMemoryMode();
  return Array.from(inMemoryUsers.values()).find((user) => user.username === username) || null;
};

const findUserByGoogleId = async (googleId) => {
  if (isDbAvailable()) {
    return User.findOne({ googleId });
  }

  warnInMemoryMode();
  return Array.from(inMemoryUsers.values()).find((user) => user.googleId === googleId) || null;
};

const createUser = async ({ _id, username, email, password, googleId, avatar }) => {
  const normalizedEmail = normalizeEmail(email);

  if (isDbAvailable()) {
    return User.create({ _id, username, email: normalizedEmail, password, googleId, avatar });
  }

  warnInMemoryMode();
  const id = _id || new mongoose.Types.ObjectId().toString();
  const passwordHash = password ? await bcrypt.hash(password, 10) : null;

  const user = {
    _id: id,
    username,
    email: normalizedEmail,
    password: passwordHash,
    googleId: googleId || undefined,
    avatar: avatar || '',
    bio: '',
    onboardingCompleted: false,
    isOnline: false,
    tier: 'free',
    refreshToken: null,
    xp: 0,
    level: 1,
    badges: [],
    streakFreezeCount: 0,
    achievements: [],
    friends: [],
    friendRequestsSent: [],
    friendRequestsReceived: [],
    blockedUsers: [],
    stats: {
      currentStreak: 0,
      longestStreak: 0,
      totalFocusMinutes: 0,
      lastActiveDate: null,
    },
    preferences: {
      focusDuration: 25,
      breakDuration: 5,
    },
    createdAt: new Date(),
    comparePassword: async function (candidatePassword) {
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
  };

  inMemoryUsers.set(id, user);
  return user;
};

const saveUser = async (user) => {
  if (isDbAvailable() && typeof user.save === 'function') {
    return user.save();
  }

  warnInMemoryMode();
  const id = user._id?.toString ? user._id.toString() : user._id;
  if (id) {
    inMemoryUsers.set(id, user);
  }
  return user;
};

const getAllUsers = async () => {
  if (isDbAvailable()) {
    const User = require('../models/User');
    return User.find({});
  }
  warnInMemoryMode();
  return Array.from(inMemoryUsers.values());
};

module.exports = {
  isDbAvailable,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  findUserByGoogleId,
  createUser,
  saveUser,
  getAllUsers,
};
