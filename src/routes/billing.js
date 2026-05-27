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
const AnalyticsService = require('../services/analyticsService');

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
    if (process.env.NODE_ENV === 'production' || endpointSecret) {
      if (!sig || !endpointSecret) {
        logAuditEvent({
          action: 'suspicious_entitlement_change',
          userId: null,
          success: false,
          metadata: { reason: 'Missing Stripe signature or endpoint secret in production/signed mode' },
        });
        return res.status(400).send('Webhook Error: Stripe signature and secret are mandatory.');
      }
      event = stripe.webhooks.constructEvent(rawPayload, sig, endpointSecret);
    } else {
      // Direct parsing fallback for non-signed development calls only
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
  } catch (err) {
    console.error(`❌ Stripe Webhook Signature Verification Failed:`, err.message);
    logAuditEvent({
      action: 'suspicious_entitlement_change',
      userId: null,
      success: false,
      metadata: { reason: 'Webhook signature validation failed', error: err.message },
    });
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
            
            // Track billing upgrade event in PostHog
            await AnalyticsService.track('subscription_started', user._id.toString(), {
              planTier: targetTier,
              previousTier,
              stripeCustomerId: session.customer
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

            // Track billing cancellation/mutation in PostHog
            if (isDeleted) {
              await AnalyticsService.track('subscription_cancelled', user._id.toString(), {
                planTier: 'free',
                previousTier,
                stripeCustomerId: customerId
              });
            } else {
              await AnalyticsService.track('subscription_started', user._id.toString(), {
                planTier: nextTier,
                previousTier,
                stripeCustomerId: customerId
              });
            }

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
          user.tier = 'grace_period';
          await user.save();

          logAuditEvent({
            action: 'payment_failed_tier_revoked',
            userId: user._id,
            previousTier,
            nextTier: 'grace_period',
            resource: req.originalUrl,
            metadata: { invoiceId: invoice.id, amountDue: invoice.amount_due, attemptCount: invoice.attempt_count || 1 },
          });
          console.warn(`⚠️ User ${user.username} entered billing GRACE_PERIOD due to failed Stripe invoice payment.`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        if (invoice.amount_paid > 0) {
          const user = await User.findOne({ stripeCustomerId: customerId });
          if (user && user.tier === 'grace_period') {
            user.tier = 'pro';
            await user.save();

            logAuditEvent({
              action: 'tier_changed',
              userId: user._id,
              previousTier: 'grace_period',
              nextTier: 'pro',
              resource: req.originalUrl,
              metadata: { invoiceId: invoice.id, amountPaid: invoice.amount_paid },
            });
            console.log(`✅ User ${user.username} billing grace resolved. Restored to Pro tier.`);
          }
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const sub = event.data.object;
        const customerId = sub.customer;

        const user = await User.findOne({ stripeCustomerId: customerId });
        if (user) {
          logAuditEvent({
            action: 'trial_will_end_alert',
            userId: user._id,
            success: true,
            metadata: { subscriptionId: sub.id, trialEnd: sub.trial_end },
          });
          console.log(`📡 User ${user.username} trial is scheduled to complete shortly.`);
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
 * Initiate Stripe checkout session (Strictly fails safely without fallbacks)
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

    if (!stripe) {
      logAuditEvent({
        action: 'upgrade_failed',
        userId: req.user._id,
        previousTier,
        resource: req.originalUrl,
        success: false,
        metadata: { reason: 'Stripe client is not initialized' }
      });
      return res.status(503).json({
        error: 'BILLING_SERVICE_UNAVAILABLE',
        message: 'The billing service is currently unavailable. Please try again later.',
      });
    }

    const priceId = cycle === 'yearly'
      ? process.env.STRIPE_YEARLY_PRICE_ID
      : process.env.STRIPE_MONTHLY_PRICE_ID;

    if (!priceId) {
      logAuditEvent({
        action: 'upgrade_failed',
        userId: req.user._id,
        previousTier,
        resource: req.originalUrl,
        success: false,
        metadata: { reason: `Price ID missing for cycle: ${cycle}` }
      });
      return res.status(500).json({
        error: 'BILLING_CONFIG_ERROR',
        message: 'Billing service is misconfigured. Missing price configuration.',
      });
    }

    // Create Stripe checkout session with Automatic Tax calculations enabled
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      automatic_tax: { enabled: true },
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

  } catch (error) {
    console.error('Stripe Upgrade Session Error:', error);
    logAuditEvent({
      action: 'upgrade_failed',
      userId: req.user?._id,
      previousTier: req.user?.tier,
      resource: req.originalUrl,
      success: false,
      metadata: { error: error.message }
    });
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
      return res.status(503).json({
        error: 'BILLING_SERVICE_UNAVAILABLE',
        message: 'The billing portal is currently unavailable.',
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

/**
 * POST /api/v1/billing/cancel
 * Cancel active subscription securely
 */
router.post('/cancel', async (req, res) => {
  try {
    const user = req.user;
    const previousTier = user.tier || 'free';
    const customerId = user.stripeCustomerId;

    logAuditEvent({
      action: 'cancel_requested',
      userId: user._id,
      previousTier,
      nextTier: 'free',
      resource: req.originalUrl,
    });

    if (stripe && customerId) {
      try {
        const subscriptions = await stripe.subscriptions.list({ customer: customerId });
        for (const sub of subscriptions.data) {
          await stripe.subscriptions.cancel(sub.id);
        }
      } catch (err) {
        console.warn('[Billing Cancel] Stripe subscription cancel failed:', err.message);
      }
    }

    user.tier = 'free';
    await user.save();

    await AnalyticsService.track('subscription_cancelled', user._id.toString(), {
      planTier: 'free',
      previousTier,
      stripeCustomerId: customerId || 'sandbox'
    });

    return res.json({
      success: true,
      message: 'Subscription successfully cancelled.',
      user: user.toSafeObject()
    });

  } catch (error) {
    console.error('Subscription Cancel Error:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to cancel subscription' });
  }
});

module.exports = router;
