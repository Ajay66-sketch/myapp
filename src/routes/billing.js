// src/routes/billing.js
// Production ready billing API router for Razorpay checkout orders, webhooks, and cancellation

const express = require('express');
const { protect } = require('../middleware/auth');
const plans = require('../config/plans');
const permissions = require('../utils/permissions');
const { findUserById, saveUser } = require('../utils/authStore');
const { logAuditEvent } = require('../utils/auditLogger');
const env = require('../config/env');
const User = require('../models/User'); // MongoDB User schema model
const AnalyticsService = require('../services/analyticsService');
const systemEventBus = require('../telemetry/eventBus');
const userRepository = require('../repositories/UserRepository');
const { getSystemState } = require('../config/serviceRegistry');
const { getRazorpayClient, setBillingStatus } = require('../config/razorpay');

function markBillingUp() {
  if (getSystemState().billing !== 'UP') {
    setBillingStatus('UP');
  }
}

const router = express.Router();

/**
 * Helper to standardise Razorpay error handling and prevent uncaught/unhandled rejections
 */
function handleBillingFailure(res, error, context) {
  console.error(`[CHAOS][FAILOVER] Razorpay operation [${context}] failed:`);
  if (error) {
    console.error(`  - error.message:`, error.message);
    console.error(`  - error.error:`, error.error);
    console.error(`  - error.statusCode:`, error.statusCode);
    console.error(`  - error.response:`, error.response);
    console.error(`  - error.stack:`, error.stack);
  } else {
    console.error(`  - error object is undefined/null`);
  }
  console.warn(`[CHAOS][DEGRADED MODE] Razorpay unavailable → billing degraded`);
  
  if (getSystemState().billing !== 'DEGRADED') {
    setBillingStatus('DEGRADED');
  }

  return res.status(503).json({
    error: "Billing temporarily unavailable",
    mode: "degraded"
  });
}

/**
 * POST /api/v1/billing/webhook
 * Razorpay Webhook Handler
 */
router.post('/webhook', async (req, res) => {
  const rzp = getRazorpayClient();
  if (!rzp) {
    return handleBillingFailure(res, new Error('Razorpay client not initialized'), 'webhook_init');
  }

  const sig = req.headers['x-razorpay-signature'];
  const endpointSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

  let event;
  try {
    const rawPayload = req.rawBody || req.body;
    const rawPayloadStr = Buffer.isBuffer(rawPayload) ? rawPayload.toString('utf8') : (typeof rawPayload === 'string' ? rawPayload : JSON.stringify(rawPayload));
    
    if (process.env.NODE_ENV === 'production' || endpointSecret) {
      if (!sig || !endpointSecret) {
        logAuditEvent({
          action: 'suspicious_entitlement_change',
          userId: null,
          success: false,
          metadata: { reason: 'Missing Razorpay signature or webhook secret in production/signed mode' },
        });
        return handleBillingFailure(res, new Error('Webhook missing sig or secret'), 'webhook_verify');
      }
      
      const Razorpay = require('razorpay');
      const isValid = Razorpay.validateWebhookSignature(rawPayloadStr, sig, endpointSecret);
      if (!isValid) {
        throw new Error('Invalid Razorpay signature');
      }
      markBillingUp();
    }
    
    event = typeof rawPayloadStr === 'string' ? JSON.parse(rawPayloadStr) : rawPayloadStr;
  } catch (err) {
    return handleBillingFailure(res, err, 'webhook_construct');
  }

  const eventType = event.event;
  const eventId = event.created_at ? `${eventType}_${event.created_at}` : `rzp_evt_${Math.random()}`;
  console.log(`📡 Razorpay Webhook Event Received: [${eventType}] (ID: ${eventId})`);

  let isDuplicate = false;
  let redisClient = null;
  try {
    const socketModule = require('../socket');
    redisClient = socketModule.getRedisClient();
  } catch (e) {}

  if (redisClient && redisClient.status === 'ready') {
    try {
      const lockKey = `webhook:processed:${eventId}`;
      const acquired = await redisClient.set(lockKey, 'processed', 'EX', 86400, 'NX');
      if (acquired !== 'OK') {
        isDuplicate = true;
      }
    } catch (e) {
      console.warn('[Razorpay Webhook] Redis idempotency connection exception:', e.message);
    }
  } else {
    if (!global.processedWebhooks) {
      global.processedWebhooks = new Set();
    }
    if (global.processedWebhooks.has(eventId)) {
      isDuplicate = true;
    } else {
      global.processedWebhooks.add(eventId);
      if (global.processedWebhooks.size > 10000) {
        const items = Array.from(global.processedWebhooks);
        global.processedWebhooks = new Set(items.slice(5000));
      }
    }
  }

  if (isDuplicate) {
    console.log(`⚠️ Razorpay Webhook: Duplicate event delivery rejected: ${eventId}`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    let userId = null;
    let customerId = null;
    let subscriptionId = null;
    
    if (event.payload?.subscription?.entity) {
      const subEntity = event.payload.subscription.entity;
      userId = subEntity.notes?.userId;
      customerId = subEntity.customer_id;
      subscriptionId = subEntity.id;
    } else if (event.payload?.payment?.entity) {
      const payEntity = event.payload.payment.entity;
      userId = payEntity.notes?.userId;
      customerId = payEntity.customer_id;
    }

    let user = null;
    if (userId) {
      user = await User.findById(userId);
    }
    if (!user && subscriptionId) {
      user = await User.findOne({ 'billing.subscriptionId': subscriptionId });
    }
    if (!user && customerId) {
      user = await User.findOne({ 'billing.customerId': customerId });
    }

    switch (eventType) {
      case 'subscription.activated':
      case 'subscription.charged':
      case 'subscription.completed': {
        if (user) {
          const previousTier = user.tier || 'free';
          const targetTier = 'pro';
          
          user.tier = targetTier;
          user.billing = {
            provider: 'razorpay',
            customerId: customerId || user.billing?.customerId,
            subscriptionId: subscriptionId || user.billing?.subscriptionId,
            status: 'active'
          };
          if (!user.badges.includes('premium_member')) {
            user.badges.push('premium_member');
          }
          await user.save();
          await userRepository.update(user._id.toString(), {
            tier: targetTier,
            billing: user.billing,
            badges: user.badges
          });

          logAuditEvent({
            action: 'tier_changed',
            userId: user._id,
            previousTier,
            nextTier: targetTier,
            resource: req.originalUrl,
            metadata: { billing: user.billing, eventId },
          });
          
          await AnalyticsService.track('subscription_started', user._id.toString(), {
            planTier: targetTier,
            previousTier,
            customerId: customerId
          });

          console.log(`✅ User ${user.username} upgraded to ${targetTier} via Razorpay subscription.`);
        }
        break;
      }
      
      case 'subscription.cancelled': {
        if (user) {
          const previousTier = user.tier || 'free';
          const nextTier = 'free';

          if (previousTier !== nextTier) {
            user.tier = nextTier;
            if (user.billing) {
              user.billing.status = 'cancelled';
            }
            await user.save();
            await userRepository.update(user._id.toString(), { tier: nextTier, billing: user.billing });

            logAuditEvent({
              action: 'tier_changed',
              userId: user._id,
              previousTier,
              nextTier,
              resource: req.originalUrl,
              metadata: { billing: user.billing },
            });

            await AnalyticsService.track('subscription_cancelled', user._id.toString(), {
              planTier: 'free',
              previousTier,
              customerId: customerId
            });

            console.log(`✅ User ${user.username} tier mutated: ${previousTier} -> ${nextTier} based on subscription status.`);
          }
        }
        break;
      }
      
      case 'payment.failed': {
        if (user) {
          const previousTier = user.tier || 'free';
          user.tier = 'grace_period';
          if (user.billing) {
            user.billing.status = 'payment_failed';
          }
          await user.save();
          await userRepository.update(user._id.toString(), { tier: 'grace_period', billing: user.billing });

          logAuditEvent({
            action: 'payment_failed_tier_revoked',
            userId: user._id,
            previousTier,
            nextTier: 'grace_period',
            resource: req.originalUrl,
            metadata: { eventId },
          });
          console.warn(`⚠️ User ${user.username} entered billing GRACE_PERIOD due to failed Razorpay payment.`);
        }
        break;
      }
      
      case 'payment.captured': {
        if (user && (user.tier === 'free' || user.tier === 'grace_period')) {
          const previousTier = user.tier;
          user.tier = 'pro';
          user.billing = {
            provider: 'razorpay',
            customerId: customerId || user.billing?.customerId,
            subscriptionId: subscriptionId || user.billing?.subscriptionId,
            status: 'active'
          };
          if (!user.badges.includes('premium_member')) {
            user.badges.push('premium_member');
          }
          await user.save();
          await userRepository.update(user._id.toString(), { tier: 'pro', billing: user.billing, badges: user.badges });

          logAuditEvent({
            action: 'tier_changed',
            userId: user._id,
            previousTier,
            nextTier: 'pro',
            resource: req.originalUrl,
            metadata: { eventId },
          });
          console.log(`✅ User ${user.username} billing grace/free resolved. Upgraded to Pro tier via payment.captured.`);
        }
        break;
      }

      default:
        console.log(`💡 Unhandled Webhook Event Type: ${eventType}`);
    }

    return res.json({ received: true });
  } catch (error) {
    return handleBillingFailure(res, error, 'webhook_process');
  }
});

// Apply JWT authentication protections to subsequent customer billing APIs
router.use(protect);

/**
 * GET /api/v1/billing/plans
 * Retrieve pricing plans features setup
 */
router.get('/plans', (req, res) => {
  try {
    return res.json({
      success: true,
      plans: Object.values(plans.PLANS),
    });
  } catch (error) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to retrieve plans' });
  }
});

/**
 * POST /api/v1/billing/upgrade
 * Initiate Razorpay checkout order creation
 */
router.post('/upgrade', async (req, res) => {
  const rzp = getRazorpayClient();
  if (!rzp) {
    return handleBillingFailure(res, new Error('Razorpay client not initialized'), 'upgrade_init');
  }

  try {
    const cycle = req.body.cycle || 'monthly';
    const previousTier = req.user.tier || 'free';

    if (previousTier === 'pro') {
      return res.status(400).json({
        error: 'ALREADY_SUBSCRIBED',
        message: 'You are already subscribed to the Pro plan.',
      });
    }

    logAuditEvent({
      action: 'upgrade_requested',
      userId: req.user._id,
      previousTier,
      nextTier: 'pro',
      resource: req.originalUrl,
    });

    const priceVal = cycle === 'yearly'
      ? process.env.RAZORPAY_YEARLY_PRICE
      : process.env.RAZORPAY_MONTHLY_PRICE;

    if (!priceVal) {
      logAuditEvent({
        action: 'upgrade_failed',
        userId: req.user._id,
        previousTier,
        resource: req.originalUrl,
        success: false,
        metadata: { reason: `Price missing for cycle: ${cycle}` }
      });
      return res.status(500).json({
        error: 'BILLING_CONFIG_ERROR',
        message: 'Billing service is misconfigured. Missing price configuration.',
      });
    }

    let amount = 50000;
    const parsedPrice = parseFloat(priceVal);
    if (!isNaN(parsedPrice)) {
      amount = Math.round(parsedPrice * 100);
    }

    const order = await rzp.orders.create({
      amount: amount,
      currency: 'INR',
      receipt: `receipt_${req.user._id}`,
      notes: {
        userId: req.user._id.toString(),
        planId: 'pro',
        cycle
      }
    });

    markBillingUp();

    return res.json({
      success: true,
      status: 'order_created',
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    logAuditEvent({
      action: 'upgrade_failed',
      userId: req.user?._id,
      previousTier: req.user?.tier,
      resource: req.originalUrl,
      success: false,
      metadata: { error: error.message }
    });
    return handleBillingFailure(res, error, 'upgrade_session');
  }
});

/**
 * GET /api/v1/billing/portal
 * Create customer billing portal redirection link (Not supported by Razorpay)
 */
router.get('/portal', async (req, res) => {
  return res.status(501).json({
    error: 'NOT_IMPLEMENTED',
    message: 'Billing portal is not supported on Razorpay. Please manage subscriptions directly on our website or contact support.'
  });
});

/**
 * POST /api/v1/billing/cancel
 * Cancel active subscription securely
 */
router.post('/cancel', async (req, res) => {
  const rzp = getRazorpayClient();
  if (!rzp) {
    return handleBillingFailure(res, new Error('Razorpay client not initialized'), 'cancel_init');
  }

  try {
    const user = await userRepository.get(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }
    const previousTier = user.tier || 'free';
    const subId = user.billing?.subscriptionId;

    logAuditEvent({
      action: 'cancel_requested',
      userId: user._id,
      previousTier,
      nextTier: 'free',
      resource: req.originalUrl,
    });

    if (subId) {
      try {
        await rzp.subscriptions.cancel(subId, false);
        markBillingUp();
      } catch (err) {
        console.warn('[Billing Cancel] Razorpay subscription cancel failed:', err.message);
      }
    }

    user.tier = 'free';
    if (user.billing) {
      user.billing.status = 'cancelled';
    }
    await user.save();

    await AnalyticsService.track('subscription_cancelled', user._id.toString(), {
      planTier: 'free',
      previousTier,
      customerId: user.billing?.customerId || 'sandbox'
    });

    return res.json({
      success: true,
      message: 'Subscription successfully cancelled.',
      user: user.toSafeObject()
    });

  } catch (error) {
    return handleBillingFailure(res, error, 'cancel_session');
  }
});

module.exports = router;
