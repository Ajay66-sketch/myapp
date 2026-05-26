// src/routes/gamification.js
// Express API router for SaaS gamification, social profiles, leaderboards, and friendship systems using UserRepository

const express = require('express');
const { protect } = require('../middleware/auth');
const authStore = require('../utils/authStore');
const userRepository = require('../repositories/UserRepository');
const xpService = require('../services/xpService');
const achievementService = require('../services/achievementService');
const notificationService = require('../services/notificationService');
const { logAuditEvent } = require('../utils/auditLogger');

const router = express.Router();

// Enforce JWT-protection for all gamification and friendship endpoints
router.use(protect);

/**
 * GET /api/v1/gamification/leaderboards
 * Retrieves global focus and XP leaderboards (Daily, Weekly, All-Time)
 */
router.get('/leaderboards', async (req, res, next) => {
  try {
    let dailyLeaderboard = [];
    let weeklyLeaderboard = [];
    let allTimeLeaderboard = [];
    let xpLeaderboard = [];

    const allUsers = await authStore.getAllUsers();

    if (authStore.isDbAvailable()) {
      const FocusSession = require('../models/FocusSession');

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // 1. Daily Focus leaderboard: aggregate from FocusSession
      const dailyStats = await FocusSession.aggregate([
        { $match: { startTime: { $gte: oneDayAgo } } },
        { $group: { _id: '$userId', totalMinutes: { $sum: '$durationMinutes' } } },
        { $sort: { totalMinutes: -1 } },
        { $limit: 10 }
      ]);
      dailyLeaderboard = await Promise.all(
        dailyStats.map(async (stat) => {
          const user = await userRepository.get(stat._id);
          if (!user) return null;
          const safeUser = user.toSafeObject ? user.toSafeObject() : user;
          safeUser.stats = { ...safeUser.stats, focusMinutes: stat.totalMinutes };
          return safeUser;
        })
      );
      dailyLeaderboard = dailyLeaderboard.filter(Boolean);

      // 2. Weekly Focus leaderboard: aggregate from FocusSession
      const weeklyStats = await FocusSession.aggregate([
        { $match: { startTime: { $gte: oneWeekAgo } } },
        { $group: { _id: '$userId', totalMinutes: { $sum: '$durationMinutes' } } },
        { $sort: { totalMinutes: -1 } },
        { $limit: 10 }
      ]);
      weeklyLeaderboard = await Promise.all(
        weeklyStats.map(async (stat) => {
          const user = await userRepository.get(stat._id);
          if (!user) return null;
          const safeUser = user.toSafeObject ? user.toSafeObject() : user;
          safeUser.stats = { ...safeUser.stats, focusMinutes: stat.totalMinutes };
          return safeUser;
        })
      );
      weeklyLeaderboard = weeklyLeaderboard.filter(Boolean);
    }

    // Sort by focus minutes and XP for all-time stats
    allTimeLeaderboard = [...allUsers]
      .sort((a, b) => ((b.stats?.totalFocusMinutes || 0) - (a.stats?.totalFocusMinutes || 0)))
      .slice(0, 10)
      .map((u) => (u.toSafeObject ? u.toSafeObject() : u));

    xpLeaderboard = [...allUsers]
      .sort((a, b) => ((b.xp || 0) - (a.xp || 0)))
      .slice(0, 10)
      .map((u) => (u.toSafeObject ? u.toSafeObject() : u));

    // In-memory fallbacks if DB is not available
    if (!authStore.isDbAvailable()) {
      dailyLeaderboard = allTimeLeaderboard;
      weeklyLeaderboard = allTimeLeaderboard;
    }

    return res.status(200).json({
      status: 'success',
      data: {
        daily: dailyLeaderboard,
        weekly: weeklyLeaderboard,
        allTime: allTimeLeaderboard,
        xp: xpLeaderboard,
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/gamification/profile/:userId
 * Retrieves complete public gamification profile for any registered user
 */
router.get('/profile/:userId', async (req, res, next) => {
  try {
    const userId = req.params.userId;
    const requestorId = req.user._id.toString();

    // Dynamically update study streaks if requesting own profile
    if (requestorId === userId) {
      const streakService = require('../services/streakService');
      await streakService.recordStreakActivity(userId);
    }

    const user = await userRepository.get(userId);
    if (!user) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Profile user not found',
      });
    }

    const safeUser = user.toSafeObject ? user.toSafeObject() : user;
    return res.status(200).json({
      status: 'success',
      data: safeUser,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/gamification/friends/request
 * Sends a friend request to body payload { friendId }
 */
router.post('/friends/request', async (req, res, next) => {
  try {
    const { friendId } = req.body;
    const userId = req.user._id.toString();

    if (!friendId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Friend ID is required in request payload',
      });
    }

    const friendStr = friendId.toString();
    if (userId === friendStr) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'You cannot send a friend request to yourself',
      });
    }

    const recipient = await userRepository.get(friendStr);
    if (!recipient) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Target friend user not found',
      });
    }

    const sender = await userRepository.get(userId);

    // Initialize arrays
    if (!sender.friendRequestsSent) sender.friendRequestsSent = [];
    if (!sender.friends) sender.friends = [];
    if (!sender.blockedUsers) sender.blockedUsers = [];

    if (!recipient.friendRequestsReceived) recipient.friendRequestsReceived = [];
    if (!recipient.friends) recipient.friends = [];
    if (!recipient.blockedUsers) recipient.blockedUsers = [];

    // Check if already friends
    if (sender.friends.includes(friendStr)) {
      return res.status(400).json({
        error: 'ALREADY_FRIENDS',
        message: 'You are already friends with this user',
      });
    }

    // Check block list boundaries
    if (sender.blockedUsers.includes(friendStr) || recipient.blockedUsers.includes(userId)) {
      return res.status(400).json({
        error: 'BLOCKED',
        message: 'Friendship blocked',
      });
    }

    // Check duplicate requests
    if (sender.friendRequestsSent.includes(friendStr)) {
      return res.status(400).json({
        error: 'DUPLICATE_REQUEST',
        message: 'Friend request already sent',
      });
    }

    // Append friendship request logs
    sender.friendRequestsSent.push(friendStr);
    recipient.friendRequestsReceived.push(userId);

    await userRepository.update(userId, { friendRequestsSent: sender.friendRequestsSent });
    await userRepository.update(friendStr, { friendRequestsReceived: recipient.friendRequestsReceived });

    // Send notifications
    await notificationService.createNotification({
      userId: friendStr,
      type: 'social',
      title: 'New Friend Request',
      message: `${sender.username} sent you a friend request!`,
      link: `/profile/${userId}`,
    });

    // Broadcast realtime event
    const socketModule = require('../socket');
    try {
      const io = socketModule.getIO();
      io.to(friendStr).emit('friend:request', {
        requesterId: userId,
        requesterUsername: sender.username,
      });
    } catch (e) {}

    return res.status(200).json({
      status: 'success',
      message: 'Friend request sent successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/gamification/friends/accept
 * Accepts a pending friend request from body payload { requesterId }
 */
router.post('/friends/accept', async (req, res, next) => {
  try {
    const { requesterId } = req.body;
    const userId = req.user._id.toString();

    if (!requesterId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Requester ID is required in payload',
      });
    }

    const requesterStr = requesterId.toString();
    const user = await userRepository.get(userId);
    const requester = await userRepository.get(requesterStr);

    if (!requester) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'Requester user not found',
      });
    }

    // Initialize arrays
    if (!user.friends) user.friends = [];
    if (!user.friendRequestsReceived) user.friendRequestsReceived = [];
    if (!requester.friends) requester.friends = [];
    if (!requester.friendRequestsSent) requester.friendRequestsSent = [];

    // Verify pending request exists
    if (!user.friendRequestsReceived.includes(requesterStr)) {
      return res.status(400).json({
        error: 'NOT_FOUND',
        message: 'No pending friend request from this user found',
      });
    }

    // Remove requests arrays and move to friends
    user.friendRequestsReceived = user.friendRequestsReceived.filter((id) => id !== requesterStr);
    requester.friendRequestsSent = requester.friendRequestsSent.filter((id) => id !== userId);

    if (!user.friends.includes(requesterStr)) {
      user.friends.push(requesterStr);
    }
    if (!requester.friends.includes(userId)) {
      requester.friends.push(userId);
    }

    await userRepository.update(userId, {
      friendRequestsReceived: user.friendRequestsReceived,
      friends: user.friends
    });

    await userRepository.update(requesterStr, {
      friendRequestsSent: requester.friendRequestsSent,
      friends: requester.friends
    });

    // Unlocks 'SOCIAL_CONNECT' achievement milestones
    await achievementService.checkAndUnlock(userId, 'SOCIAL_CONNECT');
    await achievementService.checkAndUnlock(requesterStr, 'SOCIAL_CONNECT');

    // Create custom notification alert
    await notificationService.createNotification({
      userId: requesterStr,
      type: 'social',
      title: 'Friend Request Accepted',
      message: `${user.username} accepted your friend request!`,
      link: `/profile/${userId}`,
    });

    // Broadcast online status to each other
    const socketModule = require('../socket');
    try {
      const io = socketModule.getIO();
      io.to(requesterStr).emit('friend:online', {
        friendId: userId,
        friendUsername: user.username,
        status: 'online',
      });
      io.to(userId).emit('friend:online', {
        friendId: requesterStr,
        friendUsername: requester.username,
        status: 'online',
      });
    } catch (e) {}

    return res.status(200).json({
      status: 'success',
      message: 'Friend request accepted successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/gamification/friends/remove
 * Removes a friend from body payload { friendId }
 */
router.post('/friends/remove', async (req, res, next) => {
  try {
    const { friendId } = req.body;
    const userId = req.user._id.toString();

    if (!friendId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Friend ID is required in payload',
      });
    }

    const friendStr = friendId.toString();
    const user = await userRepository.get(userId);
    const friend = await userRepository.get(friendStr);

    if (user) {
      user.friends = (user.friends || []).filter((id) => id !== friendStr);
      await userRepository.update(userId, { friends: user.friends });
    }

    if (friend) {
      friend.friends = (friend.friends || []).filter((id) => id !== userId);
      await userRepository.update(friendStr, { friends: friend.friends });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Friend removed successfully',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/gamification/friends/block
 * Blocks a user from body payload { targetId }
 */
router.post('/friends/block', async (req, res, next) => {
  try {
    const { targetId } = req.body;
    const userId = req.user._id.toString();

    if (!targetId) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Target ID is required in payload',
      });
    }

    const targetStr = targetId.toString();
    const user = await userRepository.get(userId);
    const target = await userRepository.get(targetStr);

    if (user) {
      // Initialize arrays
      if (!user.blockedUsers) user.blockedUsers = [];
      if (!user.friends) user.friends = [];
      if (!user.friendRequestsSent) user.friendRequestsSent = [];
      if (!user.friendRequestsReceived) user.friendRequestsReceived = [];

      // Append to blocked
      if (!user.blockedUsers.includes(targetStr)) {
        user.blockedUsers.push(targetStr);
      }

      // Cleanup friend/requests states
      user.friends = user.friends.filter((id) => id !== targetStr);
      user.friendRequestsSent = user.friendRequestsSent.filter((id) => id !== targetStr);
      user.friendRequestsReceived = user.friendRequestsReceived.filter((id) => id !== targetStr);

      await userRepository.update(userId, {
        blockedUsers: user.blockedUsers,
        friends: user.friends,
        friendRequestsSent: user.friendRequestsSent,
        friendRequestsReceived: user.friendRequestsReceived
      });
    }

    if (target) {
      if (!target.friends) target.friends = [];
      target.friends = target.friends.filter((id) => id !== userId);
      await userRepository.update(targetStr, { friends: target.friends });
    }

    return res.status(200).json({
      status: 'success',
      message: 'User blocked successfully',
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
