// src/queue/analyticsQueue.js
// Asynchronously processes study statistics and historical trend counts

const ResilientQueue = require('./baseQueue');
const authStore = require('../utils/authStore');

const analyticsQueue = new ResilientQueue('study-analytics', async (jobData) => {
  const { userId, totalFocusMinutes, incrementAmount } = jobData;

  const user = await authStore.findUserById(userId);
  if (user) {
    if (!user.stats) user.stats = {};
    user.stats.totalFocusMinutes = (user.stats.totalFocusMinutes || 0) + incrementAmount;
    await authStore.saveUser(user);
  }
});

module.exports = analyticsQueue;
