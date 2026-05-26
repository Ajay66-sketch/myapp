// src/config/gamification.js
// Centralized configuration for SaaS gamification, leveling and social rewards

module.exports = {
  // XP rewards for various user actions
  XP_ACTIVITIES: {
    FOCUS_SESSION: 10,       // Earned on Pomodoro focus timer completion
    AI_CHAT: 5,              // Earned per context-aware AI assistant prompt
    ROOM_PARTICIPATION: 2,   // Earned per room message sent
  },

  // Daily caps and anti-abuse safeguards to prevent farming/spamming
  XP_CAPS: {
    AI_XP_DAILY_LIMIT: 25,       // Maximum XP earned from AI chat in 24 hours (5 queries)
    CHAT_XP_DAILY_LIMIT: 20,     // Maximum XP earned from room chat messages in 24 hours (10 messages)
    CHAT_COOLDOWN_MS: 5000,      // Mandatory cooling period (5 seconds) between messages to receive XP
  },

  // XP requirement curve: cumulative threshold per level
  // Level 1: Requires 200 XP to hit Level 2
  // Level 2: Requires 400 XP cumulative to hit Level 3
  xpRequiredForLevel: (level) => {
    if (level < 1) return 0;
    return level * 200;
  },

  // Centralized Achievements definitions
  ACHIEVEMENTS: {
    FIRST_ROOM: {
      key: 'first_room',
      title: 'Room Pioneer',
      description: 'Create your first collaborative study focus room.',
      xpReward: 50,
      badge: 'room_pioneer',
    },
    FIRST_AI: {
      key: 'first_ai',
      title: 'AI Companion',
      description: 'Interact with the study room AI assistant.',
      xpReward: 30,
      badge: 'ai_adopter',
    },
    WEEK_STREAK: {
      key: 'week_streak',
      title: 'Weekly Warrior',
      description: 'Maintain a 7-day study streak milestone.',
      xpReward: 100,
      badge: 'week_warrior',
    },
    MONTH_STREAK: {
      key: 'month_streak',
      title: 'Streak Titan',
      description: 'Maintain an elite 30-day study streak milestone.',
      xpReward: 500,
      badge: 'streak_titan',
    },
    SOCIAL_CONNECT: {
      key: 'social_connect',
      title: 'Study Circles',
      description: 'Form a friendship with another focus peer.',
      xpReward: 40,
      badge: 'social_connector',
    },
    PREMIUM_UPGRADE: {
      key: 'premium_upgrade',
      title: 'Unlimited Focus',
      description: 'Unlock premium study features with a Pro subscription.',
      xpReward: 150,
      badge: 'premium_member',
    },
  },

  // Centralized badges list
  BADGES: {
    room_pioneer: {
      key: 'room_pioneer',
      name: 'Room Pioneer',
      description: 'Awarded for creating a focus chamber.',
    },
    ai_adopter: {
      key: 'ai_adopter',
      name: 'AI Adopter',
      description: 'Awarded for leveraging artificial intelligence.',
    },
    week_warrior: {
      key: 'week_warrior',
      name: 'Weekly Warrior',
      description: 'Awarded for surviving a solid 7 days of focus.',
    },
    streak_titan: {
      key: 'streak_titan',
      name: 'Streak Titan',
      description: 'Awarded for achieving a 30-day focus milestone.',
    },
    social_connector: {
      key: 'social_connector',
      name: 'Social Connector',
      description: 'Awarded for making a study friend.',
    },
    premium_member: {
      key: 'premium_member',
      name: 'Premium Member',
      description: 'Sleek premium subscriber emblem.',
    },
  },
};
