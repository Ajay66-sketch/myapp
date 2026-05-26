// src/services/streakService.js
// Daily study streak tracking engine, maintaining freeze cushions, comeback bonuses, and milestone rewards

const authStore = require('../utils/authStore');
const achievementService = require('./achievementService');
const notificationService = require('./notificationService');
const xpService = require('./xpService');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * Record user focus activity and evaluate study streak metrics.
 * Safely handles midnight boundary differences, streak freeze cushions, and comeback bonuses.
 * 
 * @param {string} userId - Target User ID
 * @returns {Promise<object>} Streak statistics
 */
async function recordStreakActivity(userId) {
  if (!userId) return null;
  const userStr = userId.toString();

  try {
    const user = await authStore.findUserById(userStr);
    if (!user) return null;

    if (!user.stats) {
      user.stats = {
        currentStreak: 0,
        longestStreak: 0,
        totalFocusMinutes: 0,
        lastActiveDate: null,
      };
    }

    const today = new Date();
    const lastActive = user.stats.lastActiveDate ? new Date(user.stats.lastActiveDate) : null;
    
    let originalStreak = user.stats.currentStreak || 0;
    let newStreak = originalStreak;
    let freezeUsed = false;
    let comebackAwarded = false;

    if (!lastActive) {
      // First activity ever!
      newStreak = 1;
      user.stats.currentStreak = 1;
      user.stats.longestStreak = 1;
      user.stats.lastActiveDate = today;
    } else {
      // Calculate midnight difference
      const lastMidnight = new Date(lastActive.getFullYear(), lastActive.getMonth(), lastActive.getDate());
      const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      const diffTime = todayMidnight - lastMidnight;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays === 0) {
        // Active today already, maintain current streak
        return {
          currentStreak: user.stats.currentStreak,
          longestStreak: user.stats.longestStreak,
          lastActiveDate: user.stats.lastActiveDate,
        };
      } else if (diffDays === 1) {
        // Active on consecutive days
        newStreak = originalStreak + 1;
        user.stats.currentStreak = newStreak;
        
        if (newStreak > (user.stats.longestStreak || 0)) {
          user.stats.longestStreak = newStreak;
        }
        user.stats.lastActiveDate = today;
      } else {
        // Gap in activity!
        if ((user.streakFreezeCount || 0) > 0) {
          // Use streak freeze cushion
          user.streakFreezeCount -= 1;
          freezeUsed = true;
          user.stats.lastActiveDate = today; // saved!
          
          await notificationService.createNotification({
            userId: userStr,
            type: 'social',
            title: 'Streak Freeze Used ❄️',
            message: 'Your study streak was frozen and saved! Freeze count decreased by 1.',
          });
        } else {
          // Streak reset
          newStreak = 1;
          user.stats.currentStreak = 1;
          user.stats.lastActiveDate = today;

          // Comeback reward for return after long absence (>= 7 days)
          if (diffDays >= 7) {
            comebackAwarded = true;
            await xpService.awardXp(userStr, 20); // Award 20 XP comeback bonus!
            
            await notificationService.createNotification({
              userId: userStr,
              type: 'social',
              title: 'Welcome Back! 👋',
              message: 'Great to see you again! Earned a comeback bonus +20 XP!',
            });
          }
        }
      }
    }

    await authStore.saveUser(user);

    // Evaluate streak achievements
    if (newStreak >= 7) {
      await achievementService.checkAndUnlock(userStr, 'WEEK_STREAK');
    }
    if (newStreak >= 30) {
      await achievementService.checkAndUnlock(userStr, 'MONTH_STREAK');
    }

    // Log audit tracking event
    logAuditEvent({
      action: 'streak_updated',
      userId: userStr,
      resource: `user:${userStr}`,
      success: true,
      metadata: { currentStreak: user.stats.currentStreak, longestStreak: user.stats.longestStreak, freezeUsed, comebackAwarded },
    });

    // Emit Realtime event
    const socketModule = require('../socket');
    try {
      const io = socketModule.getIO();
      io.to(userStr).emit('streak:updated', {
        userId: userStr,
        currentStreak: user.stats.currentStreak,
        longestStreak: user.stats.longestStreak,
      });
    } catch (e) {}

    return user.stats;
  } catch (error) {
    console.error('[Streak Engine] Failed to record streak activity:', error);
    return null;
  }
}

module.exports = {
  recordStreakActivity,
};
