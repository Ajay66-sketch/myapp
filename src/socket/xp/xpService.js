// src/socket/xp/xpService.js
// Handles Focus Session XP awards and study stats updates on completion events

const coreEventBus = require('../../core/eventBus');
const presenceService = require('../presence/presenceService');
const xpService = require('../../services/xpService');
const authStore = require('../../utils/authStore');
const AnalyticsService = require('../../services/analyticsService');

const getIO = () => require('../../socket').getIO();

// Listen to completion events
coreEventBus.on('timer:complete', handleTimerComplete);

async function handleTimerComplete({ roomId, timer }) {
  const io = getIO();
  const minutes = Math.round((timer.duration || 1500) / 60) || 25;

  try {
    const roomSockets = io.sockets.adapter.rooms.get(`room:${roomId}`) || io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const socketId of roomSockets) {
        const activeUser = presenceService.onlineUsers.get(socketId);
        if (activeUser && activeUser.userId) {
          // 1. Award Focus Session XP
          xpService.awardXp(activeUser.userId, 'FOCUS_SESSION');

          // 2. Persist updated focus minutes to DB
          const currentUserId = activeUser.userId;
          (async () => {
            try {
              const user = await authStore.findUserById(currentUserId);
              if (user) {
                if (!user.stats) user.stats = {};
                user.stats.totalFocusMinutes = (user.stats.totalFocusMinutes || 0) + minutes;
                await authStore.saveUser(user);

                // Push real-time stats update back to client
                io.to(currentUserId.toString()).emit('user:stats_update', {
                  totalFocusMinutes: user.stats.totalFocusMinutes,
                });

                // Track server-side pomodoro_completed event in PostHog
                await AnalyticsService.track('pomodoro_completed', currentUserId, {
                  durationMinutes: minutes,
                  roomId
                });
              }
            } catch (dbErr) {
              console.error('[XpService Focus Mode DB save error]:', dbErr.message);
            }
          })();
        }
      }
    }
  } catch (err) {
    console.error('[XP Service completed timer award error]:', err.message);
  }
}

module.exports = {};
