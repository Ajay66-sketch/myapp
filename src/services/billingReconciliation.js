// src/services/billingReconciliation.js
// Production-grade entitlement reconciliation engine to synchronize and heal Razorpay and database tiers

const User = require('../models/User');
const { logAuditEvent } = require('../utils/auditLogger');
const userRepository = require('../repositories/UserRepository');
const { getRazorpayClient } = require('../config/razorpay');

/**
 * Reconcile a single user's subscription entitlement directly with Razorpay.
 * Resolves dropped or missed webhooks and ensures the local state matches Razorpay's single source of truth.
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
    const rzp = getRazorpayClient();

    // If Razorpay is not initialized, fail safely rather than making unverified state mutations
    if (!rzp) {
      console.warn('[Reconciliation] Razorpay client is not active. Skipping check.');
      return { success: false, reason: 'BILLING_INACTIVE' };
    }

    // Case 1: User claims to be Pro but has no subscriptionId associated
    const subId = user.billing?.subscriptionId;
    if ((user.tier === 'pro' || user.tier === 'grace_period') && !subId) {
      user.tier = 'free';
      if (user.billing) {
        user.billing.status = 'cancelled';
      }
      await user.save();

      // Force-evict cached user so that API middleware gets immediate fresh state
      await userRepository.update(user._id.toString(), { tier: 'free', billing: user.billing });

      logAuditEvent({
        action: 'suspicious_entitlement_change',
        userId: user._id,
        previousTier,
        nextTier: 'free',
        success: true,
        metadata: { reason: 'User tier was Pro but subscriptionId was missing' },
      });

      console.warn(`⚠️ [Reconciliation] Downgraded user ${user.username} to free due to missing subscriptionId.`);
      return { success: true, user, reconciled: true, action: 'downgraded_no_subscription' };
    }

    // If there's no subscriptionId, and they are free, they are already in sync
    if (!subId) {
      return { success: true, user, reconciled: false, action: 'none' };
    }

    // Query Razorpay directly for active/trialing subscriptions
    console.log(`[Reconciliation] Fetching subscription details from Razorpay for subscription: ${subId}`);
    
    let subDetail = null;
    try {
      subDetail = await rzp.subscriptions.fetch(subId);
    } catch (err) {
      console.error(`❌ [Reconciliation] Razorpay subscription fetch failed for ${subId}:`, err.message);
      if (err.message && (err.message.includes('not found') || err.statusCode === 404)) {
        user.tier = 'free';
        if (user.billing) {
          user.billing.status = 'cancelled';
        }
        await user.save();
        await userRepository.update(user._id.toString(), { tier: 'free', billing: user.billing });
        return { success: true, user, reconciled: true, action: 'downgraded_not_found' };
      }
      throw err;
    }

    const hasActiveSub = subDetail && (subDetail.status === 'active' || subDetail.status === 'trialing');
    const targetTier = hasActiveSub ? 'pro' : 'free';

    if (previousTier !== targetTier) {
      user.tier = targetTier;
      if (user.billing) {
        user.billing.status = subDetail.status;
      }
      await user.save();

      // Ensure cache is refreshed
      await userRepository.update(user._id.toString(), { tier: targetTier, billing: user.billing });

      const logAction = targetTier === 'pro' ? 'tier_changed' : 'payment_failed_tier_revoked';
      logAuditEvent({
        action: logAction,
        userId: user._id,
        previousTier,
        nextTier: targetTier,
        success: true,
        metadata: {
          reason: 'Webhook reconciliation sync',
          subscriptionId: subId,
          status: subDetail.status,
          hasActiveSub,
        },
      });

      console.log(`✅ [Reconciliation] User ${user.username} tier synchronized: ${previousTier} -> ${targetTier}`);
      return { success: true, user, reconciled: true, action: targetTier === 'pro' ? 'upgraded' : 'downgraded' };
    }

    console.log(`[Reconciliation] User ${user.username} is already in sync with Razorpay.`);
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

/**
 * Run reconciliation for all relevant users in the database
 */
async function reconcileAllUsers() {
  console.log('[Reconciliation] Starting bulk user billing reconciliation...');
  try {
    const userIds = await User.find({
      $or: [
        { 'billing.subscriptionId': { $exists: true, $ne: null } },
        { tier: 'pro' },
        { tier: 'grace_period' }
      ]
    }).select('_id').lean();

    console.log(`[Reconciliation] Found ${userIds.length} users to reconcile.`);
    const results = [];
    const batchSize = 50;

    for (let i = 0; i < userIds.length; i += batchSize) {
      const chunk = userIds.slice(i, i + batchSize);
      const batchPromises = chunk.map(u => reconcileUserEntitlement(u._id.toString()));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Yield event loop execution
      await new Promise(resolve => setImmediate(resolve));
    }

    console.log('[Reconciliation] Bulk user billing reconciliation complete.');
    return results;
  } catch (error) {
    console.error('[Reconciliation Error] Bulk reconciliation failed:', error.message);
    throw error;
  }
}

let reconciliationIntervalId = null;
let retryTimeoutId = null;
let isReconciling = false;
let currentBackoffMs = 5000;
const MIN_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 60 * 60 * 1000; // 1 hour
let lastErrorMessage = null;

async function executeReconciliationWithRetry() {
  if (isReconciling) return;
  isReconciling = true;
  try {
    await reconcileAllUsers();
    currentBackoffMs = MIN_BACKOFF_MS;
    lastErrorMessage = null;
    isReconciling = false;
  } catch (err) {
    isReconciling = false;
    if (err.message !== lastErrorMessage) {
      console.error(`[Reconciliation Error] Bulk reconciliation failed: ${err.message}. Retrying in ${currentBackoffMs / 1000}s...`);
      lastErrorMessage = err.message;
    }

    if (retryTimeoutId) clearTimeout(retryTimeoutId);
    retryTimeoutId = setTimeout(() => {
      executeReconciliationWithRetry().catch(() => {});
    }, currentBackoffMs);

    currentBackoffMs = Math.min(currentBackoffMs * 2, MAX_BACKOFF_MS);
  }
}

function startBillingReconciliationScheduler(intervalMs = 6 * 60 * 60 * 1000) {
  if (reconciliationIntervalId) {
    console.log('[Reconciliation] Scheduler already started.');
    return;
  }

  const envInterval = process.env.BILLING_RECONCILIATION_INTERVAL_MS;
  if (envInterval) {
    intervalMs = parseInt(envInterval, 10);
  }

  console.log(`[Reconciliation] Starting billing reconciliation scheduler (Interval: ${intervalMs}ms)...`);
  
  // Run immediately (with a brief delay to allow startup database connection to settle)
  setTimeout(async () => {
    await executeReconciliationWithRetry();
  }, 5000);

  // Schedule periodic runs
  reconciliationIntervalId = setInterval(async () => {
    if (isReconciling || retryTimeoutId) {
      console.warn('[Reconciliation] Reconciliation run or retry is already active/scheduled. Skipping interval tick.');
      return;
    }
    await executeReconciliationWithRetry();
  }, intervalMs);
}

function stopBillingReconciliationScheduler() {
  if (reconciliationIntervalId) {
    clearInterval(reconciliationIntervalId);
    reconciliationIntervalId = null;
  }
  if (retryTimeoutId) {
    clearTimeout(retryTimeoutId);
    retryTimeoutId = null;
  }
  console.log('[Reconciliation] Scheduler stopped.');
}

module.exports = {
  reconcileUserEntitlement,
  reconcileAllUsers,
  startBillingReconciliationScheduler,
  stopBillingReconciliationScheduler,
};
