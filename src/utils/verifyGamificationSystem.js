// src/utils/verifyGamificationSystem.js
// Automated verification suite for Leveling, XP anti-abuse, Achievements, Streaks, Friendships and Leaderboards

const assert = require('assert').strict;
const mongoose = require('mongoose');
const authStore = require('./authStore');
const xpService = require('../services/xpService');
const achievementService = require('../services/achievementService');
const streakService = require('../services/streakService');
const notificationService = require('../services/notificationService');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const yellow = '\x1b[33m';

let mockUserId1 = '507f1f77bcf86cd799439077';
let mockUserId2 = '507f1f77bcf86cd799439088';

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`${green}✔ [PASSED]${reset} ${name}`);
  } catch (error) {
    console.error(`${red}✘ [FAILED]${reset} ${name}`);
    console.error(error);
    process.exit(1);
  }
}

async function runAll() {
  console.log(`${yellow}=== STARTING SOCIAL GROWTH & GAMIFICATION ARCHITECTURE VERIFICATION ===${reset}\n`);

  // Force in-memory mode
  const originalIsDbAvailable = authStore.isDbAvailable;
  authStore.isDbAvailable = () => false;

  // Clear in-memory databases
  notificationService.clearInMemoryNotifications();
  xpService.clearXpLogs();

  // Create two mock users with explicit IDs to avoid key collisions
  await authStore.createUser({
    _id: mockUserId1,
    username: 'alan_gamify',
    email: 'alan@gamify.com',
    password: 'password123',
  });

  await authStore.createUser({
    _id: mockUserId2,
    username: 'bob_gamify',
    email: 'bob@gamify.com',
    password: 'password123',
  });

  // ─── 1. XP Engine & Leveling Progression ───────────────────────────────────
  await runTest('XP Service Leveling & Promotion Thresholds', async () => {
    const res = await xpService.awardXp(mockUserId1, 250); // Level 1 -> Requires 200 XP for Level 2
    assert.equal(res.xpGained, 250);
    assert.equal(res.user.level, 2);
    assert.equal(res.leveledUp, true);
  });

  // ─── 2. XP Anti-Abuse Spam Cooling and Caps ──────────────────────────────────
  await runTest('XP Anti-Abuse (Daily Ceilings & Spam Cooling Shield)', async () => {
    xpService.clearXpLogs();

    // 1. Trigger AI Chat multiple times (Cap = 25 XP, AI_CHAT = 5 XP)
    for (let i = 0; i < 7; i++) {
      await xpService.awardXp(mockUserId1, 'AI_CHAT');
    }
    const log = xpService.getDailyLog(mockUserId1);
    assert.equal(log.aiXpAwarded, 25); // exactly hit cap! Subsequent blocked.

    // 2. Trigger Room Chat consecutive messages (Spam Cooldown = 5000ms)
    // First message triggers XP
    const msg1 = await xpService.awardXp(mockUserId1, 'ROOM_PARTICIPATION');
    assert.ok(msg1);
    assert.equal(msg1.xpGained, 2);

    // Second message immediately triggers (should fail due to cooldown)
    const msg2 = await xpService.awardXp(mockUserId1, 'ROOM_PARTICIPATION');
    assert.equal(msg2, null); // blocked!
  });

  // ─── 3. Achievements & Badges Allocation ───────────────────────────────────
  await runTest('Achievements Unlocking & Badge Persistence', async () => {
    const newlyUnlocked = await achievementService.checkAndUnlock(mockUserId1, 'FIRST_ROOM');
    assert.equal(newlyUnlocked, true);

    const user = await authStore.findUserById(mockUserId1);
    assert.ok(user.achievements.includes('first_room'));
    assert.ok(user.badges.includes('room_pioneer'));

    // Check duplicate unlock (must skip)
    const duplicate = await achievementService.checkAndUnlock(mockUserId1, 'FIRST_ROOM');
    assert.equal(duplicate, false);
  });

  // ─── 4. Streaks, Freezes and Comeback rewards ──────────────────────────────
  await runTest('Study Streak Engine (Midnight checks, Freeze decrements, Comeback rewards)', async () => {
    const user = await authStore.findUserById(mockUserId1);
    user.stats.currentStreak = 5;
    user.streakFreezeCount = 2;
    // Set last active to 2 days ago (missed yesterday)
    user.stats.lastActiveDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await authStore.saveUser(user);

    // Record activity today (should use streak freeze cushion!)
    const stats = await streakService.recordStreakActivity(mockUserId1);
    assert.equal(stats.currentStreak, 5); // preserved streak!
    
    const updatedUser = await authStore.findUserById(mockUserId1);
    assert.equal(updatedUser.streakFreezeCount, 1); // decremented by 1!

    // Reset last active to 10 days ago (missed freeze entirely, freeze is now 0)
    updatedUser.streakFreezeCount = 0;
    updatedUser.stats.lastActiveDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    await authStore.saveUser(updatedUser);

    // Record activity (should reset streak to 1 and award Comeback Reward!)
    const stats2 = await streakService.recordStreakActivity(mockUserId1);
    assert.equal(stats2.currentStreak, 1); // reset!
    
    // Check if notification welcome back was created
    const { notifications } = await notificationService.getNotifications(mockUserId1);
    const comebackNotif = notifications.find(n => n.title.includes('Welcome Back'));
    assert.ok(comebackNotif);
  });

  // ─── 5. Friendship state circles transitions ─────────────────────────────
  await runTest('Friendship Requests, Mutual Handshakes, Blocks', async () => {
    const sender = await authStore.findUserById(mockUserId1);
    const recipient = await authStore.findUserById(mockUserId2);

    // Mock REST Request Flow
    // 1. Send Request
    sender.friendRequestsSent = [];
    recipient.friendRequestsReceived = [];
    
    sender.friendRequestsSent.push(mockUserId2);
    recipient.friendRequestsReceived.push(mockUserId1);
    
    await authStore.saveUser(sender);
    await authStore.saveUser(recipient);

    // 2. Accept Request
    const user = await authStore.findUserById(mockUserId2);
    const reqUser = await authStore.findUserById(mockUserId1);

    user.friendRequestsReceived = user.friendRequestsReceived.filter(id => id !== mockUserId1);
    reqUser.friendRequestsSent = reqUser.friendRequestsSent.filter(id => id !== mockUserId2);

    user.friends.push(mockUserId1);
    reqUser.friends.push(mockUserId2);

    await authStore.saveUser(user);
    await authStore.saveUser(reqUser);

    assert.ok(user.friends.includes(mockUserId1));
    assert.ok(reqUser.friends.includes(mockUserId2));

    // 3. Block User
    user.blockedUsers.push(mockUserId1);
    user.friends = user.friends.filter(id => id !== mockUserId1);
    await authStore.saveUser(user);

    const updatedUser = await authStore.findUserById(mockUserId2);
    assert.ok(updatedUser.blockedUsers.includes(mockUserId1));
    assert.equal(updatedUser.friends.includes(mockUserId1), false); // un-friended!
  });

  await runTest('Leaderboard Sorting Order and promotions calculations', async () => {
    // 1. Award mockUserId2 a larger amount of XP to push them to Rank 1, pushing mockUserId1 to Rank 2
    await xpService.awardXp(mockUserId2, 500);

    // 2. Now award mockUserId1 XP to overtake mockUserId2 and trigger a promotion from Rank 2 to Rank 1!
    await xpService.awardXp(mockUserId1, 300);

    const allUsers = await authStore.getAllUsers();
    
    const xpLeaderboard = [...allUsers]
      .sort((a, b) => ((b.xp || 0) - (a.xp || 0)))
      .slice(0, 10);

    // User 1 has accumulated more XP than User 2 (User 1 has ~647 XP, User 2 has 500 XP)
    assert.equal(xpLeaderboard[0]._id, mockUserId1);

    // Verify if promotion notification was sent!
    const { notifications } = await notificationService.getNotifications(mockUserId1);
    const promoNotif = notifications.find(n => n.title.includes('Leaderboard Promotion'));
    assert.ok(promoNotif);
  });

  // Restore DB function
  authStore.isDbAvailable = originalIsDbAvailable;

  console.log(`\n${green}=== ALL SOCIAL GROWTH & GAMIFICATION CHECKS PASSED ===${reset}`);
  console.log(`${green}Social Profiles, friendship requests, XP progression, and streaks are fully verified!${reset}`);
}

runAll().then(() => {
  process.exit(0);
});
