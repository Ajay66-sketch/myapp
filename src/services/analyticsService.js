// src/services/analyticsService.js
// Centralized, GDPR-compliant AnalyticsService for Scholar Platform
// Manages privacy scrubbing, spam protection, and resilient telemetry ingestion

const crypto = require('crypto');
const posthogQueue = require('../queue/posthogQueue');
const authStore = require('../utils/authStore');
const systemEventBus = require('../telemetry/eventBus');

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

// Local in-memory throttle fallback cache
const localThrottleCache = new Map();

/**
 * Get shared Redis client for SRE rate debouncing
 */
const getRedisClient = () => {
  try {
    return require('../config/redisClient').getRedisClient();
  } catch (err) {
    return null;
  }
};

/**
 * Hash emails for secure GDPR identity alignment
 */
const hashEmail = (email) => {
  if (!email || typeof email !== 'string') return '';
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
};

/**
 * Cleanse properties of raw PII and strip IP locations
 */
const scrubPII = (properties) => {
  if (!properties || typeof properties !== 'object') return {};
  const cleaned = { ...properties };

  // Mask exact email fields
  const piiKeys = ['email', 'userEmail', 'emailAddress'];
  piiKeys.forEach((key) => {
    if (cleaned[key]) {
      cleaned[`masked_${key}`] = hashEmail(cleaned[key]);
      delete cleaned[key];
    }
  });

  // Strip exact IP tracking property in PostHog
  cleaned['$ip'] = null;
  return cleaned;
};

/**
 * Check if the user event should be throttled to prevent client spamming
 */
const isSpamEvent = async (userId, eventName) => {
  if (!userId || userId === 'anonymous') return false;
  const throttleKey = `throttle:user:${userId}:event:${eventName}`;
  const redisClient = getRedisClient();

  if (redisClient && redisClient.status === 'ready') {
    try {
      const acquired = await redisClient.set(throttleKey, '1', 'NX', 'EX', 2);
      return acquired !== 'OK';
    } catch (err) {
      // Fallback silently to memory check
    }
  }

  // Local memory fallback throttling
  const now = Date.now();
  const lastTime = localThrottleCache.get(throttleKey) || 0;
  if (now - lastTime < 2000) {
    return true;
  }
  localThrottleCache.set(throttleKey, now);
  
  // Sweep local memory cache periodically
  if (localThrottleCache.size > 1000) {
    for (const [key, val] of localThrottleCache.entries()) {
      if (now - val > 5000) localThrottleCache.delete(key);
    }
  }
  return false;
};

/**
 * Synchronize and return fresh user properties for PostHog cohorts
 */
const getUserSyncProperties = async (userId) => {
  if (!userId || userId === 'anonymous') return {};

  try {
    const user = await authStore.findUserById(userId);
    if (!user) return {};

    const cohortMonth = user.createdAt
      ? new Date(user.createdAt).toISOString().slice(0, 7)
      : new Date().toISOString().slice(0, 7);

    return {
      current_streak: user.stats?.currentStreak || 0,
      plan_tier: user.tier || 'free',
      total_focus_hours: parseFloat(((user.stats?.totalFocusMinutes || 0) / 60).toFixed(2)),
      cohort_month: cohortMonth,
      referral_source: user.referralSource || 'organic',
      xp_level: user.level || 1,
      total_xp: user.xp || 0
    };
  } catch (err) {
    console.error('[AnalyticsService] User sync properties fetch error:', err.message);
    return {};
  }
};

const AnalyticsService = {
  /**
   * Track high-fidelity product analytics event asynchronously
   */
  track: async (eventName, userId = 'anonymous', properties = {}, timestamp = null) => {
    try {
      // 1. Consent Validation
      if (userId !== 'anonymous') {
        const user = await authStore.findUserById(userId);
        if (user && user.disableTracking) {
          systemEventBus.emit('analytics:blocked_consent', 'info', { eventName, userId }, userId);
          return;
        }
      }

      // 2. Spam Throttle protection
      const isSpam = await isSpamEvent(userId, eventName);
      if (isSpam) {
        systemEventBus.emit('analytics:throttled', 'warn', { eventName, userId }, userId);
        return;
      }

      // 3. GDPR IP & PII Scrubbing
      const cleanProperties = scrubPII(properties);

      // 4. User properties synchronization (injected via $set)
      if (userId !== 'anonymous') {
        const syncProps = await getUserSyncProperties(userId);
        cleanProperties['$set'] = {
          ...syncProps,
          ...(properties['$set'] || {})
        };
      }

      // 5. Enqueue background posthog task SRE-style
      await posthogQueue.add({
        eventName,
        distinctId: userId.toString(),
        properties: cleanProperties,
        timestamp: timestamp || new Date().toISOString()
      });

    } catch (err) {
      console.error('[AnalyticsService] Event tracking failed:', err.message);
    }
  },

  /**
   * Identify user profile attributes explicitly
   */
  identify: async (userId, traits = {}) => {
    if (!userId || userId === 'anonymous') return;

    try {
      const user = await authStore.findUserById(userId);
      if (user && user.disableTracking) return;

      const cleanTraits = scrubPII(traits);
      const syncProps = await getUserSyncProperties(userId);

      const mergedProperties = {
        ...cleanTraits,
        $set: {
          ...syncProps,
          ...cleanTraits
        }
      };

      await posthogQueue.add({
        eventName: '$identify',
        distinctId: userId.toString(),
        properties: mergedProperties,
        timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.error('[AnalyticsService] User identify failed:', err.message);
    }
  },

  /**
   * Handle GDPR erasure right to be forgotten
   */
  forgetUser: async (userId) => {
    if (!userId || userId === 'anonymous') return;

    try {
      // 1. Opt user out of further tracking locally
      const user = await authStore.findUserById(userId);
      if (user) {
        user.disableTracking = true;
        await authStore.saveUser(user);
      }

      // 2. Queue PostHog profile deletion deletion event ($delete_user)
      await posthogQueue.add({
        eventName: '$delete_user',
        distinctId: userId.toString(),
        properties: {
          $ip: null
        },
        timestamp: new Date().toISOString()
      });

      systemEventBus.emit('analytics:forgot_user', 'info', { userId }, userId);
    } catch (err) {
      console.error('[AnalyticsService] GDPR forgetUser deletion failed:', err.message);
    }
  }
};

module.exports = AnalyticsService;
