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

module.exports = router;
