// src/routes/adminMetrics.js
// SRE-grade operational administration dashboard for SaaS metrics and churn analytics

const express = require('express');
const { protect } = require('../middleware/auth');
const User = require('../models/User');
const AiUsageLog = require('../models/AiUsageLog');
const AuditLog = require('../models/AuditLog');

const router = express.Router();

router.use(protect);

/**
 * Enforce Admin role restriction
 */
function requireAdmin(req, res, next) {
  if (req.user.tier !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin administrative access required' });
  }
  return next();
}

/**
 * GET /api/v1/billing/admin/metrics
 * Gathers complete business intelligence indicators: MRR, ARR, Churn, and LTV
 */
router.get('/metrics', requireAdmin, async (req, res) => {
  try {
    // 1. Calculate active premium subscribers
    const activeSubscribersCount = await User.countDocuments({ tier: 'pro' });
    const freeUsersCount = await User.countDocuments({ tier: 'free' });
    const totalUsers = activeSubscribersCount + freeUsersCount;

    // Standard baseline price is $15.00/mo (normalized monthly Pro tier price)
    const monthlyPriceUsd = 15.00; 

    // Calculate MRR / ARR
    const estimatedMrr = activeSubscribersCount * monthlyPriceUsd;
    const estimatedArr = estimatedMrr * 12;

    // 2. Churn Rate Calculations (Audit transitions over the last 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Count cancellations (users downgraded to free) in the last 30 days
    const cancellations = await AuditLog.countDocuments({
      action: 'payment_failed_tier_revoked',
      createdAt: { $gte: thirtyDaysAgo }
    });

    const activeAtMonthStart = activeSubscribersCount + cancellations;
    const monthlyChurnRatePercent = activeAtMonthStart > 0 
      ? parseFloat(((cancellations / activeAtMonthStart) * 100).toFixed(2))
      : 0.00;

    // 3. Lifetime Value (LTV) Calculation: (avg price / monthly churn rate decimal)
    const churnDecimal = monthlyChurnRatePercent / 100;
    const estimatedLtvUsd = churnDecimal > 0 
      ? parseFloat((monthlyPriceUsd / churnDecimal).toFixed(2))
      : monthlyPriceUsd; // Base value if churn is 0

    // 4. AI Cost Telemetry Integration
    const costStats = await AiUsageLog.aggregate([
      {
        $group: {
          _id: null,
          totalCostUsd: { $sum: '$estimatedCostUsd' },
          totalTokens: { $sum: '$totalTokens' },
          count: { $sum: 1 }
        }
      }
    ]);
    const aiAggregate = costStats[0] || { totalCostUsd: 0, totalTokens: 0, count: 0 };

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      userBase: {
        total: totalUsers,
        premiumSubscribers: activeSubscribersCount,
        freeUsers: freeUsersCount
      },
      revenueMetrics: {
        planPriceUsd: monthlyPriceUsd,
        estimatedMrrUsd: estimatedMrr,
        estimatedArrUsd: estimatedArr,
        churnRatePercent: monthlyChurnRatePercent,
        projectedLtvUsd: estimatedLtvUsd
      },
      infrastructureAiCost: {
        cumulativeCostUsd: aiAggregate.totalCostUsd,
        totalTokensConsumed: aiAggregate.totalTokens,
        completionsServed: aiAggregate.count
      }
    });

  } catch (error) {
    console.error('[Admin Metrics API] Failure compiling dashboard:', error.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to aggregate administrative SaaS indicators' });
  }
});

/**
 * GET /api/v1/admin/billing/ai-metrics
 * Gathers detailed AI usage and cost telemetry
 */
router.get('/ai-metrics', requireAdmin, async (req, res) => {
  try {
    const aiMetrics = require('../metrics/aiMetrics');

    // 1. Gather live in-memory telemetry (hits, misses, hit ratio)
    const liveHits = aiMetrics.getCacheHits();
    const liveMisses = aiMetrics.getCacheMisses();
    const liveRatio = aiMetrics.getCacheHitRatio();
    const providerLatency = aiMetrics.getProviderLatencyMetrics();

    // 2. Query MongoDB aggregated cost statistics
    const stats = await AiUsageLog.aggregate([
      {
        $group: {
          _id: '$modelUsed',
          requestCount: { $sum: 1 },
          promptTokens: { $sum: '$promptTokens' },
          completionTokens: { $sum: '$completionTokens' },
          totalTokens: { $sum: '$totalTokens' },
          estimatedCostUsd: { $sum: '$estimatedCostUsd' }
        }
      }
    ]);

    const providerUsage = {};
    let totalRequests = 0;
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let totalCostUsd = 0;

    stats.forEach(stat => {
      const model = stat._id || 'unknown';
      providerUsage[model] = {
        requestCount: stat.requestCount,
        promptTokens: stat.promptTokens,
        completionTokens: stat.completionTokens,
        totalTokens: stat.totalTokens,
        estimatedCostUsd: stat.estimatedCostUsd
      };
      totalRequests += stat.requestCount;
      totalPromptTokens += stat.promptTokens;
      totalCompletionTokens += stat.completionTokens;
      totalTokens += stat.totalTokens;
      totalCostUsd += stat.estimatedCostUsd;
    });

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        totalRequests,
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens,
        totalCostUsd
      },
      cache: {
        hits: liveHits,
        misses: liveMisses,
        hitRatio: liveRatio
      },
      latency: providerLatency,
      providerUsage
    });
  } catch (error) {
    console.error('[Admin AI Metrics API] Failure compiling AI telemetry:', error.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to aggregate administrative AI metrics indicators' });
  }
});

/**
 * GET /api/v1/admin/billing/dlq
 * Retrieve all items inside the Dead-Letter Queue (DLQ)
 */
router.get('/dlq', requireAdmin, async (req, res) => {
  try {
    const deadLetterQueue = require('../queue/deadLetterQueue');
    const items = await deadLetterQueue.getDLQItems();
    return res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    console.error('[Admin DLQ API] Failure retrieving DLQ items:', error.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to retrieve Dead-Letter Queue items' });
  }
});

/**
 * POST /api/v1/admin/billing/dlq/:id/retry
 * Retries a failed task from the DLQ back to its originating queue
 */
router.post('/dlq/:id/retry', requireAdmin, async (req, res) => {
  try {
    const deadLetterQueue = require('../queue/deadLetterQueue');
    const success = await deadLetterQueue.retryTask(req.params.id);
    if (success) {
      return res.json({ success: true, message: `Task ${req.params.id} successfully queued for retry` });
    } else {
      return res.status(400).json({ success: false, message: `Failed to retry task ${req.params.id}. It may have been not found or exceeded retry limits.` });
    }
  } catch (error) {
    console.error('[Admin DLQ API] Failure retrying DLQ task:', error.message);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to retry Dead-Letter Queue task' });
  }
});

module.exports = router;
