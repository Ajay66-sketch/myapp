// src/routes/users.js
// User routes: list users, search users using UserRepository

const express = require('express');
const userRepository = require('../repositories/UserRepository');
const { protect } = require('../middleware/auth');

const router = express.Router();

router.use(protect);

// ─── GET /api/users ───────────────────────────────────────────────────────────
// Get all users except the currently logged-in user
// Supports optional ?search= query param for filtering by username
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;

    const users = await userRepository.searchUsers(req.user._id, search, 50);

    // Map to the shape expected by client
    const clientUsers = users.map(u => ({
      _id: u._id,
      username: u.username,
      email: u.email,
      avatar: u.avatar,
      isOnline: u.isOnline
    }));

    res.json({ users: clientUsers });
  } catch (error) {
    console.error('Fetch users error:', error);
    res.status(500).json({ message: 'Failed to fetch users' });
  }
});

// ─── GET /api/users/:userId ───────────────────────────────────────────────────
// Get a single user by ID
router.get('/:userId', async (req, res) => {
  try {
    const user = await userRepository.get(req.params.userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Convert to safe object (excludes password)
    res.json({ user: user.toSafeObject() });
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

    const updateData = {};
    if (username) {
      // Check if username is already taken by another user
      const existing = await userRepository.getByUsername(username);
      if (existing && existing._id.toString() !== user._id.toString()) {
        return res.status(409).json({ message: 'Username is already taken' });
      }
      updateData.username = username;
    }
    
    if (bio !== undefined) updateData.bio = bio;
    if (avatar !== undefined) updateData.avatar = avatar;

    const updatedUser = await userRepository.update(user._id, updateData);

    res.json({ message: 'Profile updated successfully', user: updatedUser.toSafeObject() });
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

    const updateData = { onboardingCompleted: true };

    if (username && username !== user.username) {
      const existing = await userRepository.getByUsername(username);
      if (existing && existing._id.toString() !== user._id.toString()) {
        return res.status(409).json({ message: 'Username is already taken' });
      }
      updateData.username = username;
    }

    const updatedUser = await userRepository.update(user._id, updateData);

    res.json({ message: 'Onboarding completed', user: updatedUser.toSafeObject() });
  } catch (error) {
    console.error('Onboarding error:', error);
    res.status(500).json({ message: 'Failed to complete onboarding' });
  }
});

module.exports = router;
