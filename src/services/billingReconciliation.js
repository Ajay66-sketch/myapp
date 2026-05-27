// src/services/billingReconciliation.js
// Production-grade entitlement reconciliation engine to synchronize and heal Stripe and database tiers

const User = require('../models/User');
const { logAuditEvent } = require('../utils/auditLogger');
const userRepository = require('../repositories/UserRepository');

let stripe = null;
if (process.env.STRIPE_API_KEY) {
  stripe = require('stripe')(process.env.STRIPE_API_KEY);
}

/**
 * Reconcile a single user's subscription entitlement directly with Stripe.
 * Resolves dropped or missed webhooks and ensures the local state matches Stripe's single source of truth.
 * 
 * @param {string} userId - ID of the user to reconcile
 * @returns {Promise<object>} The updated user document and synchronization results
 */
async function reconcileUserEntitlement(userId) {
  if (!userId) throw new Error('User ID is required for reconciliation');

  try {
    const user = await User.findById(userId);
    if (!user) {
      console.warn(`[Reconciliation] User not found in DB: ${userId}`);
      return { success: false, reason: 'USER_NOT_FOUND' };
    }

    const previousTier = user.tier || 'free';

    // If Stripe is not initialized, fail safely rather than making unverified state mutations
    if (!stripe) {
      console.warn('[Reconciliation] Stripe client is not active. Skipping check.');
      return { success: false, reason: 'STRIPE_INACTIVE' };
    }

    // Case 1: User claims to be Pro but has no Stripe Customer ID associated
    if (user.tier === 'pro' && !user.stripeCustomerId) {
      user.tier = 'free';
      await user.save();

      // Force-evict cached user so that API middleware gets immediate fresh state
      await userRepository.update(user._id.toString(), { tier: 'free' });

      logAuditEvent({
        action: 'suspicious_entitlement_change',
        userId: user._id,
        previousTier,
        nextTier: 'free',
        success: true,
        metadata: { reason: 'User tier was Pro but stripeCustomerId was missing' },
      });

      console.warn(`⚠️ [Reconciliation] Downgraded user ${user.username} to free due to missing stripeCustomerId.`);
      return { success: true, user, reconciled: true, action: 'downgraded_no_customer' };
    }

    // If there's no stripeCustomerId, and they are free, they are already in sync
    if (!user.stripeCustomerId) {
      return { success: true, user, reconciled: false, action: 'none' };
    }

    // Query Stripe directly for active/trialing subscriptions for this customer
    console.log(`[Reconciliation] Fetching subscription details from Stripe for customer: ${user.stripeCustomerId}`);
    const subscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'active',
      limit: 1,
    });

    const trialingSubscriptions = await stripe.subscriptions.list({
      customer: user.stripeCustomerId,
      status: 'trialing',
      limit: 1,
    });

    const hasActiveSub = subscriptions.data.length > 0 || trialingSubscriptions.data.length > 0;
    const targetTier = hasActiveSub ? 'pro' : 'free';

    if (previousTier !== targetTier) {
      user.tier = targetTier;
      await user.save();

      // Ensure cache is refreshed
      await userRepository.update(user._id.toString(), { tier: targetTier });

      const logAction = targetTier === 'pro' ? 'tier_changed' : 'payment_failed_tier_revoked';
      logAuditEvent({
        action: logAction,
        userId: user._id,
        previousTier,
        nextTier: targetTier,
        success: true,
        metadata: {
          reason: 'Webhook reconciliation sync',
          stripeCustomerId: user.stripeCustomerId,
          hasActiveSub,
        },
      });

      console.log(`✅ [Reconciliation] User ${user.username} tier synchronized: ${previousTier} -> ${targetTier}`);
      return { success: true, user, reconciled: true, action: targetTier === 'pro' ? 'upgraded' : 'downgraded' };
    }

    console.log(`[Reconciliation] User ${user.username} is already in sync with Stripe.`);
    return { success: true, user, reconciled: false, action: 'none' };

  } catch (error) {
    console.error(`❌ [Reconciliation Error] Failed to reconcile user ${userId}:`, error.message);
    logAuditEvent({
      action: 'suspicious_entitlement_change',
      userId,
      success: false,
      metadata: { reason: 'Reconciliation process crashed', error: error.message },
    });
    return { success: false, error: error.message };
  }
}

module.exports = {
  reconcileUserEntitlement,
};
