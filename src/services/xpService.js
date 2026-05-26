// src/services/xpService.js
// Centralized XP and leveling engine with daily caps and anti-farming shields

const config = require('../config/gamification');
const authStore = require('../utils/authStore');
const { logAuditEvent } = require('../utils/auditLogger');

// Daily logs map: userId -> { dateString, aiXpAwarded, chatXpAwarded, lastChatTimestamp }
const dailyXpLogs = new Map();

/**
 * Retrieve or initialize the daily logging metadata for anti-abuse tracking.
 * 
 * @param {string} userId - User ID
 * @returns {object} Daily stats config block
 */
function getDailyLog(userId) {
  const todayStr = new Date().toISOString().split('T')[0];
  const userStr = userId.toString();
  
  let log = dailyXpLogs.get(userStr);
  if (!log || log.dateString !== todayStr) {
    log = {
      dateString: todayStr,
      aiXpAwarded: 0,
      chatXpAwarded: 0,
      lastChatTimestamp: 0,
    };
    dailyXpLogs.set(userStr, log);
  }
  return log;
}

/**
 * Award XP to a user based on their active focus/social participation.
 * Enforces strict cooling thresholds and daily ceilings to prevent exploit.
 * 
 * @param {string} userId - Target User ID
 * @param {string|number} activityType - Activity identifier (e.g., 'FOCUS_SESSION', 'AI_CHAT', 'ROOM_PARTICIPATION') or explicit number
 * @returns {Promise<object|null>} Stats payload with xpGained, leveledUp, and updated user safe object
 */
async function awardXp(userId, activityType) {
  if (!userId) return null;
  const userStr = userId.toString();

  const log = getDailyLog(userStr);
  const now = Date.now();
  let xpGained = 0;

  // 1. Anti-Abuse and Caps Filters
  if (activityType === 'FOCUS_SESSION') {
    xpGained = config.XP_ACTIVITIES.FOCUS_SESSION;
  } else if (activityType === 'AI_CHAT') {
    if (log.aiXpAwarded >= config.XP_CAPS.AI_XP_DAILY_LIMIT) {
      console.log(`[XP Engine] Daily AI chat XP cap hit for user ${userStr}. Blocked.`);
      return null;
    }
    xpGained = config.XP_ACTIVITIES.AI_CHAT;
    log.aiXpAwarded += xpGained;
  } else if (activityType === 'ROOM_PARTICIPATION') {
    // Anti-spam cooldown check (5 seconds between chat messages to receive XP)
    if (now - log.lastChatTimestamp < config.XP_CAPS.CHAT_COOLDOWN_MS) {
      console.log(`[XP Engine] Spam cooling active for user ${userStr}. XP award bypassed.`);
      return null;
    }
    // Daily room participation cap check
    if (log.chatXpAwarded >= config.XP_CAPS.CHAT_XP_DAILY_LIMIT) {
      console.log(`[XP Engine] Daily chat message XP cap hit for user ${userStr}. Blocked.`);
      return null;
    }
    xpGained = config.XP_ACTIVITIES.ROOM_PARTICIPATION;
    log.chatXpAwarded += xpGained;
    log.lastChatTimestamp = now;
  } else if (typeof activityType === 'number') {
    // Explicit direct XP grant (e.g. from unlocking achievements)
    xpGained = activityType;
  }

  if (xpGained <= 0) return null;

  try {
    const user = await authStore.findUserById(userStr);
    if (!user) return null;

    const oldRank = await getLeaderboardRank(userStr);

    const oldXp = user.xp || 0;
    const oldLevel = user.level || 1;
    
    // Add XP
    user.xp = oldXp + xpGained;
    
    let leveledUp = false;
    let currentLevel = oldLevel;

    // Evaluate leveling bounds iteratively
    while (user.xp >= config.xpRequiredForLevel(currentLevel)) {
      currentLevel += 1;
      leveledUp = true;
    }

    if (leveledUp) {
      user.level = currentLevel;
    }

    await authStore.saveUser(user);

    // Check for rank promotions
    const newRank = await getLeaderboardRank(userStr);
    if (newRank < oldRank) {
      // Leaderboard Promotion!
      logAuditEvent({
        action: 'leaderboard_promotion',
        userId: userStr,
        resource: `user:${userStr}`,
        success: true,
        metadata: { oldRank, newRank },
      });

      const notificationService = require('./notificationService');
      await notificationService.createNotification({
        userId: userStr,
        type: 'social',
        title: 'Leaderboard Promotion! 🏆',
        message: `Outstanding! You rose to Rank ${newRank} on the XP leaderboard!`,
        link: `/profile/${userStr}`,
      });
    }

    // 2. Structured Auditing Logs
    logAuditEvent({
      action: 'xp_gained',
      userId: userStr,
      resource: `user:${userStr}`,
      success: true,
      metadata: { xpGained, totalXp: user.xp, level: user.level, activityType },
    });

    if (leveledUp) {
      logAuditEvent({
        action: 'level_up',
        userId: userStr,
        resource: `user:${userStr}`,
        success: true,
        metadata: { oldLevel, newLevel: user.level },
      });
    }

    // 3. Emit Realtime events
    const socketModule = require('../socket');
    try {
      const io = socketModule.getIO();
      // Push XP gains event
      io.to(userStr).emit('xp:gained', {
        userId: userStr,
        xpGained,
        totalXp: user.xp,
        level: user.level,
      });

      // Push achievement unlock for Level Up
      if (leveledUp) {
        io.to(userStr).emit('achievement:unlocked', {
          userId: userStr,
          title: `Leveled Up!`,
          description: `Outstanding! You reached Level ${user.level}.`,
        });
      }
    } catch (e) {
      // Socket.IO may not be running/initialized in direct script runs
    }

    return {
      xpGained,
      user,
      leveledUp,
    };
  } catch (error) {
    console.error('[XP Engine] Failed to process XP award:', error);
    return null;
  }
}

/**
 * Helper to determine user's current rank on the global XP leaderboard.
 */
async function getLeaderboardRank(userId) {
  try {
    const allUsers = await authStore.getAllUsers();
    const sorted = [...allUsers].sort((a, b) => (b.xp || 0) - (a.xp || 0));
    const rank = sorted.findIndex((u) => u._id.toString() === userId.toString()) + 1;
    return rank > 0 ? rank : sorted.length + 1;
  } catch (error) {
    return 999;
  }
}

/**
 * Clear in-memory daily XP caps log registry (useful during verification suites)
 */
function clearXpLogs() {
  dailyXpLogs.clear();
}

module.exports = {
  awardXp,
  clearXpLogs,
  getDailyLog,
  getLeaderboardRank,
};
