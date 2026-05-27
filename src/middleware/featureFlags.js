// src/middleware/featureFlags.js
// SRE-grade dynamic feature gating and entitlement enforcement middleware

const FeatureFlag = require('../models/FeatureFlag');

/**
 * Express middleware to dynamically enforce feature gating.
 * 
 * @param {string} flagKey - Unique key of the feature flag to check
 */
function checkFeatureFlag(flagKey) {
  return async (req, res, next) => {
    try {
      const user = req.user;
      const userTier = String(user?.tier || 'free').toLowerCase();

      // Find flag configuration in persistent MongoDB
      const flag = await FeatureFlag.findOne({ key: flagKey });

      if (flag) {
        // 1. Enforce global maintenance lock
        if (!flag.isActiveGlobally) {
          return res.status(503).json({
            error: 'FEATURE_DISABLED',
            message: 'This feature is temporarily in offline SRE maintenance. Please try again later.'
          });
        }

        // 2. Enforce tiered subscription gates
        const isAllowed = flag.allowedTiers.some(t => t.toLowerCase() === userTier);
        if (!isAllowed) {
          return res.status(403).json({
            error: 'FEATURE_LOCKED',
            message: `The "${flagKey}" feature is locked. Please upgrade to Pro to unlock premium access.`
          });
        }
      }

      // Default fallback: proceed if flag is not explicitly defined/restricted in DB
      return next();
    } catch (error) {
      console.error(`[FeatureFlag Middleware] Verification error for key "${flagKey}":`, error.message);
      // Fallback safe path: don't break in-flight routes if Mongo has query drop-offs
      return next();
    }
  };
}

module.exports = {
  checkFeatureFlag
};
