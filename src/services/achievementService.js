// src/services/achievementService.js
// Centralized service for awarding user achievements and gamification badges

const config = require('../config/gamification');
const authStore = require('../utils/authStore');
const xpService = require('./xpService');
const notificationService = require('./notificationService');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * Check and award an achievement to a user if not already earned.
 * Automatically rewards bonus XP and triggers realtime notification flows.
 * 
 * @param {string} userId - Target User ID
 * @param {string} achievementKey - Target Achievement Key (e.g. 'FIRST_ROOM', 'FIRST_AI')
 * @returns {Promise<boolean>} True if newly unlocked, false if already earned or on error
 */
async function checkAndUnlock(userId, achievementKey) {
  if (!userId || !achievementKey) return false;
  const userStr = userId.toString();

  // Find achievement definition in config
  const achievement = config.ACHIEVEMENTS[achievementKey];
  if (!achievement) {
    console.error(`[Achievement Engine] Achievement configuration not found for key: ${achievementKey}`);
    return false;
  }

  try {
    const user = await authStore.findUserById(userStr);
    if (!user) return false;

    // Initialize arrays if they don't exist
    if (!user.achievements) user.achievements = [];
    if (!user.badges) user.badges = [];

    // Skip if already unlocked
    if (user.achievements.includes(achievement.key)) {
      return false;
    }

    // Unlock achievement
    user.achievements.push(achievement.key);

    // Award associated badge
    if (achievement.badge && !user.badges.includes(achievement.badge)) {
      user.badges.push(achievement.badge);
    }

    // Persist user modifications
    await authStore.saveUser(user);

    // 1. Audit Log Unlock & PostHog Telemetry
    logAuditEvent({
      action: 'achievement_unlocked',
      userId: userStr,
      resource: `achievement:${achievement.key}`,
      success: true,
      metadata: { title: achievement.title, xpReward: achievement.xpReward },
    });

    const AnalyticsService = require('./analyticsService');
    await AnalyticsService.track('achievement_unlocked', userStr, {
      achievementKey: achievement.key,
      title: achievement.title,
      xpReward: achievement.xpReward,
      badge: achievement.badge || ''
    });

    // 2. Award Achievement XP bonus
    if (achievement.xpReward > 0) {
      await xpService.awardXp(userStr, achievement.xpReward);
    }

    // 3. Create persistent Notification
    await notificationService.createNotification({
      userId: userStr,
      type: 'achievement',
      title: `Achievement Unlocked: ${achievement.title}!`,
      message: `${achievement.description} (+${achievement.xpReward} XP)`,
      link: `/profile/${userStr}`,
    });

    // 4. Emit Realtime Socket Event
    const socketModule = require('../socket');
    try {
      const io = socketModule.getIO();
      io.to(userStr).emit('achievement:unlocked', {
        userId: userStr,
        achievementKey: achievement.key,
        title: achievement.title,
        description: achievement.description,
        badge: achievement.badge,
        xpReward: achievement.xpReward,
      });
    } catch (e) {
      // Socket not active in script verification runs
    }

    return true;
  } catch (error) {
    console.error('[Achievement Engine] Failed to check and unlock achievement:', error);
    return false;
  }
}

module.exports = {
  checkAndUnlock,
};
