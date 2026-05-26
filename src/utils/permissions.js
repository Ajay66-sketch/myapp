// src/utils/permissions.js
// Centralized permission engine for deterministic SaaS logic

const plans = require('../config/plans');

/**
 * Get active plan for a user, failing safely to the FREE plan if unknown or error occurs.
 * Maps legacy 'premium' tier string to the new 'pro' plan.
 * 
 * @param {object} user - The user object
 * @returns {object} The resolved plan configuration object from plans.js
 */
function getPlan(user) {
  try {
    if (!user || !user.tier) {
      return plans.FREE_PLAN;
    }

    const tier = String(user.tier).toLowerCase();

    if (tier === 'premium') {
      return plans.PRO_PLAN;
    }

    return plans.PLANS[tier] || plans.FREE_PLAN;
  } catch (error) {
    console.error('[Permissions Engine] Failed to get user plan, defaulting to FREE:', error);
    return plans.FREE_PLAN;
  }
}

/**
 * Verify if user is allowed to send chat messages.
 * 
 * @param {object} user - The user object
 * @returns {boolean}
 */
function canSendMessage(user) {
  try {
    const plan = getPlan(user);
    // All current plans can send messages, but limits govern them
    return plan.id === 'free' || plan.id === 'pro' || plan.id === 'admin';
  } catch (error) {
    return true; // fail safe (free standard allows chatting)
  }
}

/**
 * Check if the user is allowed to create another study room.
 * 
 * @param {object} user - The user object
 * @param {number} currentRoomCount - Number of rooms currently owned/created by the user
 * @returns {boolean}
 */
function canCreateRoom(user, currentRoomCount = 0) {
  try {
    const plan = getPlan(user);
    return currentRoomCount < plan.limits.roomLimit;
  } catch (error) {
    return false; // fail safely by restricting creation if engine errors
  }
}

/**
 * Verify if AI capabilities are unlocked for the user.
 * 
 * @param {object} user - The user object
 * @returns {boolean}
 */
function canUseAi(user) {
  try {
    const plan = getPlan(user);
    return !!plan.aiEnabled;
  } catch (error) {
    return false; // fail safely: no AI for errors
  }
}

/**
 * Check if user is allowed to access application analytics dashboard.
 * 
 * @param {object} user - The user object
 * @returns {boolean}
 */
function canAccessAnalytics(user) {
  try {
    const plan = getPlan(user);
    return plan.id === 'admin' || !!plan.features.analytics_dashboard;
  } catch (error) {
    return false; // fail safely: deny administrative operations on error
  }
}

/**
 * Retrieve current plan's socket and usage limits for the user.
 * 
 * @param {object} user - The user object
 * @returns {object} The limit settings object (limits field of the plan)
 */
function getRateLimits(user) {
  try {
    const plan = getPlan(user);
    return plan.limits;
  } catch (error) {
    return plans.FREE_PLAN.limits; // fail safe: return free tier limits
  }
}

/**
 * Deterministically check if user has access to a specific feature flag.
 * 
 * @param {object} user - The user object
 * @param {string} feature - Feature name key
 * @returns {boolean}
 */
function hasFeature(user, feature) {
  try {
    const plan = getPlan(user);
    // Admins bypass all feature restrictions
    if (plan.id === 'admin') return true;
    return !!plan.features[feature];
  } catch (error) {
    return false; // fail safely: restrict features on error
  }
}

module.exports = {
  getPlan,
  canSendMessage,
  canCreateRoom,
  canUseAi,
  canAccessAnalytics,
  getRateLimits,
  hasFeature,
};
