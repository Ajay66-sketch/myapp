// src/models/User.js
// Mongoose schema and model for Users

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required'],
      unique: true,
      trim: true,
      minlength: [3, 'Username must be at least 3 characters'],
      maxlength: [30, 'Username cannot exceed 30 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      // Password is not required for Google OAuth users
      required: function() { return !this.googleId; },
      minlength: [6, 'Password must be at least 6 characters'],
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    bio: {
      type: String,
      maxlength: [160, 'Bio cannot exceed 160 characters'],
      default: '',
    },
    refreshToken: {
      type: String,
    },
    onboardingCompleted: {
      type: Boolean,
      default: false,
    },
    // Optional avatar URL for future use
    avatar: {
      type: String,
      default: '',
    },
    // Track online status for real-time features
    isOnline: {
      type: Boolean,
      default: false,
    },
    tier: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free',
    },
    stripeCustomerId: {
      type: String,
    },
    stats: {
      currentStreak: { type: Number, default: 0 },
      longestStreak: { type: Number, default: 0 },
      totalFocusMinutes: { type: Number, default: 0 },
      lastActiveDate: Date,
    },
    preferences: {
      focusDuration: { type: Number, default: 25 },
      breakDuration: { type: Number, default: 5 },
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// ─── Pre-save Hook: Hash password before saving ───────────────────────────────
userSchema.pre('save', async function (next) {
  // Only hash if the password field was modified (or is new)
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// ─── Instance Method: Compare password ───────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// ─── Instance Method: Return safe user object (no password) ──────────────────
userSchema.methods.toSafeObject = function () {
  return {
    _id: this._id,
    username: this.username,
    email: this.email,
    avatar: this.avatar,
    bio: this.bio,
    onboardingCompleted: this.onboardingCompleted,
    isOnline: this.isOnline,
    tier: this.tier,
    stats: this.stats,
    preferences: this.preferences,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model('User', userSchema);
