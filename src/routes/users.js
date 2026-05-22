// src/routes/users.js
// User routes: list users, search users

const express = require('express');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// ─── GET /api/users ───────────────────────────────────────────────────────────
// Get all users except the currently logged-in user
// Supports optional ?search= query param for filtering by username
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;

    // Build the query — always exclude the current user
    const query = { _id: { $ne: req.user._id } };

    // If a search term is provided, do a case-insensitive username search
    if (search && search.trim()) {
      query.username = { $regex: search.trim(), $options: 'i' };
    }

    const users = await User.find(query)
      .select('username email avatar isOnline')
      .sort({ username: 1 })
      .limit(50); // cap results for performance

    res.json({ users });
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// ─── GET /api/users/:userId ───────────────────────────────────────────────────
// Get a single user by ID
router.get('/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({ message: 'Failed to fetch user' });
  }
});

// ─── PUT /api/users/profile ───────────────────────────────────────────────────
// Update user profile (username, bio, avatar)
router.put('/profile', async (req, res) => {
  try {
    const { username, bio, avatar } = req.body;
    const user = req.user;

    if (username) {
      // Check if username is already taken by another user
      const existing = await User.findOne({ username, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ message: 'Username is already taken' });
      }
      user.username = username;
    }
    
    if (bio !== undefined) user.bio = bio;
    if (avatar !== undefined) user.avatar = avatar;

    await user.save();

    res.json({ message: 'Profile updated successfully', user: user.toSafeObject() });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile' });
  }
});

// ─── POST /api/users/onboarding ───────────────────────────────────────────────
// Complete onboarding
router.post('/onboarding', async (req, res) => {
  try {
    const { username } = req.body;
    const user = req.user;

    if (username && username !== user.username) {
      const existing = await User.findOne({ username, _id: { $ne: user._id } });
      if (existing) {
        return res.status(409).json({ message: 'Username is already taken' });
      }
      user.username = username;
    }

    user.onboardingCompleted = true;
    await user.save();

    res.json({ message: 'Onboarding completed', user: user.toSafeObject() });
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ message: 'Failed to complete onboarding' });
  }
});

module.exports = router;
