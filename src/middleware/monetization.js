const userRepository = require('../repositories/UserRepository');
const { getPlan, hasFeature } = require('../utils/permissions');
const { logAuditEvent } = require('../utils/auditLogger');

/**
 * Helper to fetch the most up-to-date user state from UserRepository (caching layer).
 * Prevents issues with stale JWT tokens when subscription tiers are mutated.
 */
async function getUpToDateUser(req) {
  if (req.user && req.user._id) {
    try {
      const freshUser = await userRepository.get(req.user._id.toString());
      if (freshUser) {
        return typeof freshUser.toSafeObject === 'function'
          ? freshUser.toSafeObject()
          : freshUser;
      }
    } catch (error) {
      console.error('[Monetization Middleware] Failed to load up-to-date user from cache/DB:', error);
    }
  }
  return req.user;
}

/**
 * Enforce that the authenticated user is on the Pro or Admin tier.
 */
async function requirePro(req, res, next) {
  try {
    const user = await getUpToDateUser(req);
    const plan = getPlan(user);

    if (plan.id === 'pro' || plan.id === 'admin') {
      req.user = user; // Update request user reference
      return next();
    }

    logAuditEvent({
      action: 'feature_access_denied',
      userId: user?._id,
      previousTier: user?.tier || 'free',
      resource: req.originalUrl,
      success: false,
      metadata: { reason: 'Pro tier required' },
    });

    return res.status(403).json({
      error: 'PRO_REQUIRED',
      message: 'Pro subscription required to access this resource',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Enforce that the authenticated user is on the Admin tier.
 */
async function requireAdmin(req, res, next) {
  try {
    const user = await getUpToDateUser(req);
    const plan = getPlan(user);

    if (plan.id === 'admin') {
      req.user = user; // Update request user reference
      
      // Audit successful admin route access
      logAuditEvent({
        action: 'admin_route_access',
        userId: user?._id,
        previousTier: user?.tier || 'free',
        resource: req.originalUrl,
        success: true,
      });

      return next();
    }

    logAuditEvent({
      action: 'feature_access_denied',
      userId: user?._id,
      previousTier: user?.tier || 'free',
      resource: req.originalUrl,
      success: false,
      metadata: { reason: 'Admin role required' },
    });

    return res.status(403).json({
      error: 'ADMIN_REQUIRED',
      message: 'Administrator privileges required to access this resource',
    });
  } catch (error) {
    next(error);
  }
}

/**
 * Enforce that the user has a specific SaaS feature flag enabled on their plan.
 * 
 * @param {string} featureName - The name of the feature to enforce (e.g. 'ai_chat')
 */
function requireFeature(featureName) {
  return async (req, res, next) => {
    try {
      const user = await getUpToDateUser(req);

      if (hasFeature(user, featureName)) {
        req.user = user; // Update request user reference
        return next();
      }

      logAuditEvent({
        action: 'feature_access_denied',
        userId: user?._id,
        previousTier: user?.tier || 'free',
        resource: req.originalUrl,
        success: false,
        metadata: { reason: `Feature locked: ${featureName}` },
      });

      return res.status(403).json({
        error: 'FEATURE_LOCKED',
        message: `The feature '${featureName}' is locked under your current plan`,
      });
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  requirePro,
  requireAdmin,
  requireFeature,
};
