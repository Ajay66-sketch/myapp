// src/config/plans.js
// Single source of truth for monetization plans, pricing, limits, and features

const FREE_PLAN = {
  id: 'free',
  displayName: 'Free Plan',
  monthlyPrice: 0,
  yearlyPrice: 0,
  features: {
    ai_chat: false,
    ai_rooms: false,
    ai_summaries: false,
    analytics_dashboard: false,
    priority_support: false,
  },
  limits: {
    roomLimit: 1,
    rateLimits: {
      'room:chat': { limit: 3, windowMs: 2000 },       // Stricter chat rate (low message throughput)
      'chat:message': { limit: 3, windowMs: 2000 },    // Low global chat throughput
      'room:join': { limit: 2, windowMs: 60000 },      // Stricter cooldown (max 2 joins per minute)
      'timer:start': { limit: 1, windowMs: 15000 },    // Stricter timer starting cooldown (1 per 15s)
      'room:typing': { limit: 3, windowMs: 2000 },
      'chat:join': { limit: 2, windowMs: 15000 },
      'room:leave': { limit: 2, windowMs: 60000 },
      'timer:pause': { limit: 3, windowMs: 60000 },
      'timer:resume': { limit: 3, windowMs: 60000 },
      'timer:cancel': { limit: 3, windowMs: 60000 },
      'socket:reauth': { limit: 5, windowMs: 60000 },
    },
  },
  socketPriority: 0,
  aiEnabled: false,
  historyRetentionDays: 7,
};

const PRO_PLAN = {
  id: 'pro',
  displayName: 'Pro Plan',
  monthlyPrice: 15,
  yearlyPrice: 144,
  features: {
    ai_chat: true,
    ai_rooms: true,
    ai_summaries: true,
    analytics_dashboard: false,
    priority_support: true,
  },
  limits: {
    roomLimit: 10,
    rateLimits: {
      'room:chat': { limit: 15, windowMs: 1000 },      // Relaxed chat rate (high throughput)
      'chat:message': { limit: 15, windowMs: 1000 },   // High global chat throughput
      'room:join': { limit: 10, windowMs: 60000 },     // Relaxed join cooldown
      'timer:start': { limit: 5, windowMs: 5000 },     // Faster timer operations
      'room:typing': { limit: 10, windowMs: 1000 },
      'chat:join': { limit: 10, windowMs: 10000 },
      'room:leave': { limit: 10, windowMs: 60000 },
      'timer:pause': { limit: 10, windowMs: 60000 },
      'timer:resume': { limit: 10, windowMs: 60000 },
      'timer:cancel': { limit: 10, windowMs: 60000 },
      'socket:reauth': { limit: 15, windowMs: 60000 },
    },
  },
  socketPriority: 1,
  aiEnabled: true,
  historyRetentionDays: 30,
};

const ADMIN_PLAN = {
  id: 'admin',
  displayName: 'Administrator',
  monthlyPrice: 0,
  yearlyPrice: 0,
  features: {
    ai_chat: true,
    ai_rooms: true,
    ai_summaries: true,
    analytics_dashboard: true,
    priority_support: true,
  },
  limits: {
    roomLimit: Infinity, // Bypass limits
    rateLimits: {
      'room:chat': { limit: Infinity, windowMs: 1000 },
      'chat:message': { limit: Infinity, windowMs: 1000 },
      'room:join': { limit: Infinity, windowMs: 60000 },
      'timer:start': { limit: Infinity, windowMs: 5000 },
      'room:typing': { limit: Infinity, windowMs: 1000 },
      'chat:join': { limit: Infinity, windowMs: 10000 },
      'room:leave': { limit: Infinity, windowMs: 60000 },
      'timer:pause': { limit: Infinity, windowMs: 60000 },
      'timer:resume': { limit: Infinity, windowMs: 60000 },
      'timer:cancel': { limit: Infinity, windowMs: 60000 },
      'socket:reauth': { limit: Infinity, windowMs: 60000 },
    },
  },
  socketPriority: 2,
  aiEnabled: true,
  historyRetentionDays: 365,
};

const PLANS = {
  free: FREE_PLAN,
  pro: PRO_PLAN,
  admin: ADMIN_PLAN,
};

module.exports = {
  FREE_PLAN,
  PRO_PLAN,
  ADMIN_PLAN,
  PLANS,
};
