// src/routes/billing.js
// Production ready billing API router for Stripe checkout, portals, and webhook signature verification

const express = require('express');
const { protect } = require('../middleware/auth');
const plans = require('../config/plans');
const permissions = require('../utils/permissions');
const { findUserById, saveUser } = require('../utils/authStore');
const { logAuditEvent } = require('../utils/auditLogger');
const env = require('../config/env');
const User = require('../models/User'); // MongoDB User schema model

const router = express.Router();

// Initialize Stripe Client securely in production
let stripe = null;
if (process.env.STRIPE_API_KEY) {
  stripe = require('stripe')(process.env.STRIPE_API_KEY);
  console.log('💳 Stripe Billing Client initialized successfully.');
} else {
  console.warn('⚠️ Stripe API key missing. Operating in sandboxed billing mode.');
}

/**
 * POST /api/v1/billing/webhook
 * Stripe Webhook Handler (Must be registered BEFORE protect middleware to receive raw payloads)
 */
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripe) {
    console.warn('[Stripe Webhook] Received webhook but Stripe client is disabled.');
    return res.status(400).json({ error: 'STRIPE_DISABLED' });
  }

  let event;
  try {
    const rawPayload = req.rawBody || req.body;
    if (endpointSecret && sig) {
      event = stripe.webhooks.constructEvent(rawPayload, sig, endpointSecret);
    } else {
      // Direct parsing fallback for non-signed development calls
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
  } catch (err) {
    console.error(`❌ Stripe Webhook Signature Verification Failed:`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📡 Stripe Webhook Event Received: [${event.type}] (ID: ${event.id})`);

  const eventId = event.id;
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
      console.warn('[Stripe Webhook] Redis idempotency connection exception:', e.message);
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
    console.log(`⚠️ Stripe Webhook: Duplicate event delivery rejected: ${eventId}`);
    return res.status(200).json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const targetTier = session.metadata?.planId || 'pro';

        if (userId) {
          const user = await User.findById(userId);
          if (user) {
            const previousTier = user.tier || 'free';
            user.tier = targetTier;
            user.stripeCustomerId = session.customer;
            if (!user.badges.includes('premium_member')) {
              user.badges.push('premium_member');
            }
            await user.save();

            logAuditEvent({
              action: 'tier_changed',
              userId: user._id,
              previousTier,
              nextTier: targetTier,
              resource: req.originalUrl,
              metadata: { stripeCustomerId: session.customer, checkoutSessionId: session.id },
            });
            console.log(`✅ User ${user.username} upgraded to ${targetTier} via checkout subscription.`);
          }
        }
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;
        const isDeleted = event.type === 'customer.subscription.deleted' || sub.status === 'canceled' || sub.status === 'unpaid';

        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          const previousTier = user.tier || 'free';
          const nextTier = isDeleted ? 'free' : 'pro';

          if (previousTier !== nextTier) {
            user.tier = nextTier;
            await user.save();

            logAuditEvent({
              action: 'tier_changed',
              userId: user._id,
              previousTier,
              nextTier,
              resource: req.originalUrl,
              metadata: { subscriptionId: sub.id, status: sub.status },
            });
            console.log(`✅ User ${user.username} tier mutated: ${previousTier} -> ${nextTier} based on subscription status.`);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          const previousTier = user.tier || 'free';
          user.tier = 'free';
          await user.save();

          logAuditEvent({
            action: 'payment_failed_tier_revoked',
            userId: user._id,
            previousTier,
            nextTier: 'free',
            resource: req.originalUrl,
            metadata: { invoiceId: invoice.id, amountDue: invoice.amount_due },
          });
          console.warn(`⚠️ User ${user.username} downgraded due to failed Stripe invoice.`);
        }
        break;
      }

      default:
        console.log(`💡 Unhandled Webhook Event Type: ${event.type}`);
    }

    return res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook Error Processing]:', error);
    return res.status(500).json({ error: 'Webhook processing exception occurred.' });
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
 * Initiate Stripe checkout session or simulate upgrade in sandbox fallback modes
 */
router.post('/upgrade', async (req, res) => {
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

    // ─── Case A: Stripe integration active ────────────────────────────────────
    if (stripe) {
      const priceId = cycle === 'yearly'
        ? (process.env.STRIPE_YEARLY_PRICE_ID || 'price_yearly_mock_id')
        : (process.env.STRIPE_MONTHLY_PRICE_ID || 'price_monthly_mock_id');

      // Create Stripe checkout session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${env.getClientOrigin()}/?payment=success`,
        cancel_url: `${env.getClientOrigin()}/?payment=cancel`,
        customer_email: req.user.email,
        metadata: {
          userId: req.user._id.toString(),
          planId: 'pro',
        },
      });

      return res.json({
        success: true,
        status: 'redirect',
        sessionUrl: session.url,
      });
    }

    // ─── Case B: Sandbox bypass fallback ─────────────────────────────────────
    console.warn(`[Upgrade API] Bypassing checkout session creation: sandboxed mode active.`);
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ error: 'USER_NOT_FOUND', message: 'User not found' });
    }

    user.tier = 'pro';
    if (!user.badges.includes('premium_member')) {
      user.badges.push('premium_member');
    }
    await user.save();

    logAuditEvent({
      action: 'tier_changed',
      userId: user._id,
      previousTier,
      nextTier: 'pro',
      resource: req.originalUrl,
      metadata: { provider: 'mock_stripe' },
    });

    const currentPlanConfig = plans.PLANS['pro'];
    const permissionsSnapshot = {
      tier: user.tier,
      canSendMessage: permissions.canSendMessage(user),
      canCreateRoom: permissions.canCreateRoom(user),
      canUseAi: permissions.canUseAi(user),
      canAccessAnalytics: permissions.canAccessAnalytics(user),
      rateLimits: permissions.getRateLimits(user),
      features: currentPlanConfig.features,
    };

    return res.json({
      success: true,
      status: 'success',
      message: 'Successfully upgraded to Pro Scholar plan (Simulated).',
      user: user.toSafeObject(),
      permissions: permissionsSnapshot,
    });

  } catch (error) {
    console.error('Stripe Upgrade Session Error:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to initiate checkout portal' });
  }
});

/**
 * GET /api/v1/billing/portal
 * Create customer billing portal redirection link
 */
router.get('/portal', async (req, res) => {
  try {
    if (!stripe) {
      return res.json({
        success: true,
        portalUrl: `${env.getClientOrigin()}/?portal=mock`,
      });
    }

    const customerId = req.user.stripeCustomerId;
    if (!customerId) {
      return res.status(400).json({
        error: 'NO_STRIPE_CUSTOMER',
        message: 'No Stripe active subscription found. Please upgrade first.',
      });
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: env.getClientOrigin(),
    });

    return res.json({
      success: true,
      portalUrl: portalSession.url,
    });

  } catch (error) {
    console.error('Billing Portal Creation failed:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to build billing portal session' });
  }
});

module.exports = router;
