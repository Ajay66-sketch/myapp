// src/repositories/UserStatsRepository.js
// Abstracts user gamification milestones, leaderboards, and study stats with cached UserRepository access

const userRepository = require('./UserRepository');
const xpService = require('../services/xpService');
const systemEventBus = require('../telemetry/eventBus');

/**
 * Get user stats
 */
async function get(userId) {
  try {
    const user = await userRepository.get(userId);
    return user ? user.stats : null;
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserStatsRepository', operation: 'get', error: err.message }, 'system');
    return null;
  }
}

/**
 * Award XP to a user
 */
async function awardXp(userId, activityType) {
  try {
    // Invalidate user cache since their XP and Level will change!
    const user = await userRepository.get(userId);
    if (user) {
      // Direct invalidate since awardXp will update DB
      const redisClient = require('../socket').getRedisClient();
      if (redisClient && redisClient.status === 'ready') {
        const id = user._id.toString();
        await redisClient.del(`cache:user:${id}`);
      }
    }

    const result = await xpService.awardXp(userId, activityType);
    
    // Re-warm user cache with updated data
    if (result && result.user) {
      const freshUser = await userRepository.get(userId); // will fetch fresh DB and cache
    }

    return result;
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserStatsRepository', operation: 'awardXp', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Increment user's total focus minutes atomically with fallback
 */
async function incrementFocusMinutes(userId, minutes) {
  if (!userId) return null;
  const idStr = userId.toString();

  try {
    const user = await userRepository.get(idStr);
    if (user) {
      if (!user.stats) user.stats = { currentStreak: 0, longestStreak: 0, totalFocusMinutes: 0 };
      
      const prevMinutes = user.stats.totalFocusMinutes || 0;
      user.stats.totalFocusMinutes = prevMinutes + minutes;
      
      await userRepository.update(idStr, { stats: user.stats });
      systemEventBus.emit('repository:write', 'info', { repository: 'UserStatsRepository', operation: 'incrementFocusMinutes', userId: idStr, amount: minutes }, 'system');
      
      return user.stats;
    }
    return null;
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserStatsRepository', operation: 'incrementFocusMinutes', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Get user leaderboard rank
 */
async function getLeaderboardRank(userId) {
  try {
    return await xpService.getLeaderboardRank(userId);
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'UserStatsRepository', operation: 'getLeaderboardRank', error: err.message }, 'system');
    throw err;
  }
}

module.exports = {
  get,
  awardXp,
  incrementFocusMinutes,
  getLeaderboardRank
};
