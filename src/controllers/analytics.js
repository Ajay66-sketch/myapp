// src/controllers/analytics.js
const AnalyticsEvent = require('../models/AnalyticsEvent');
const mongoose = require('mongoose');
const AnalyticsService = require('../services/analyticsService');

// POST /api/v1/analytics/batch
exports.processBatch = async (req, res) => {
  try {
    const { events } = req.body;
    if (!events || !Array.isArray(events)) {
      return res.status(400).json({ error: 'Events array is required' });
    }

    if (mongoose.connection.readyState === 1 && events.length > 0) {
      await AnalyticsEvent.insertMany(events);
    } else {
      console.log(`[Mock] Received ${events.length} analytics events`);
    }

    // Pipe events to centralized GDPR-compliant AnalyticsService
    for (const e of events) {
      const userId = e.userId || 'anonymous';
      await AnalyticsService.track(e.eventName, userId, e.properties || {}, e.timestamp);
    }

    res.status(200).json({ status: 'success', count: events.length });
  } catch (error) {
    console.error('Analytics batch error:', error);
    res.status(500).json({ error: 'Failed to process events' });
  }
};

// GET /api/v1/analytics/dashboard
exports.getDashboardMetrics = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      // Mock data for demo when DB is disabled
      return res.status(200).json({
        status: 'success',
        data: {
          dau: 185,
          wau: 920,
          mau: 2840,
          onboardingCompletionRate: 85,
          focusCompletionRate: 60,
          avgSessionDuration: 1240,
          aiInteractionCount: 156,
          featureUsage: [
            { _id: 'app_opened', count: 120 },
            { _id: 'onboarding_started', count: 50 },
            { _id: 'onboarding_completed', count: 42 },
            { _id: 'room_joined', count: 300 },
            { _id: 'focus_started', count: 200 },
            { _id: 'focus_completed', count: 120 },
            { _id: 'ai_insight_viewed', count: 156 }
          ],
          funnelOnboarding: [
            { step: 'Onboarding Started', count: 120, rate: 100 },
            { step: 'Onboarding Completed', count: 96, rate: 80 },
            { step: 'Room Joined', count: 72, rate: 75 },
            { step: 'Pomodoro Completed', count: 43, rate: 60 }
          ],
          retentionCohorts: [
            { cohort: '2026-04', cohortSize: 150, retentionRates: { week0: 100, week1: 42, week2: 30, week3: 25, week4: 20 } },
            { cohort: '2026-05', cohortSize: 220, retentionRates: { week0: 100, week1: 48, week2: 35, week3: 28, week4: 0 } }
          ],
          featureHeatmap: [
            { hour: 8, eventName: 'room_joined', count: 45 },
            { hour: 9, eventName: 'pomodoro_completed', count: 32 },
            { hour: 14, eventName: 'ai_prompt_sent', count: 58 },
            { hour: 18, eventName: 'room_joined', count: 88 },
            { hour: 20, eventName: 'pomodoro_completed', count: 75 },
            { hour: 21, eventName: 'ai_prompt_sent', count: 64 }
          ],
          aiUsageByTier: [
            { tier: 'free', totalTokens: 124000, estimatedCostUsd: 0.248, count: 850 },
            { tier: 'pro', totalTokens: 890000, estimatedCostUsd: 1.78, count: 4200 }
          ],
          churnSignals: [
            { userId: '6523f6e1f0e4b85c18c99e90', type: 'Subscription Cancelled', timestamp: new Date(Date.now() - 3600000 * 2), details: 'Downgraded from tier: pro' },
            { userId: '6523f6e1f0e4b85c18c99e91', type: 'Streak Lost', timestamp: new Date(Date.now() - 3600000 * 5), details: 'Lost active daily study streak of 12 days' }
          ],
          topReferrals: [
            { referralCode: 'SCHOLAR-REF-ALAN-TURING', count: 18 },
            { referralCode: 'SCHOLAR-REF-ADA-LOVELACE', count: 12 },
            { referralCode: 'SCHOLAR-REF-MARIE-CURIE', count: 8 }
          ]
        }
      });
    }

    const now = new Date();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // 1. DAU / WAU / MAU
    const dauDistinct = await AnalyticsEvent.distinct('userId', { timestamp: { $gte: dayAgo } });
    const wauDistinct = await AnalyticsEvent.distinct('userId', { timestamp: { $gte: weekAgo } });
    const mauDistinct = await AnalyticsEvent.distinct('userId', { timestamp: { $gte: monthAgo } });

    const dau = dauDistinct.length;
    const wau = wauDistinct.length;
    const mau = mauDistinct.length;

    // 2. Feature usage count for retro-compatibility
    const featureUsage = await AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: monthAgo } } },
      { $group: { _id: "$eventName", count: { $sum: 1 } } }
    ]);

    let onboardingStarted = 0;
    let onboardingCompleted = 0;
    let focusStarted = 0;
    let focusCompleted = 0;
    let aiInteractionCount = 0;

    featureUsage.forEach(stat => {
      switch (stat._id) {
        case 'onboarding_started': onboardingStarted = stat.count; break;
        case 'onboarding_completed': onboardingCompleted = stat.count; break;
        case 'focus_started': focusStarted = stat.count; break;
        case 'focus_completed': focusCompleted = stat.count; break;
        case 'ai_insight_viewed': aiInteractionCount = stat.count; break;
      }
    });

    const sessionStats = await AnalyticsEvent.aggregate([
      { $match: { eventName: 'session_duration' } },
      { $group: { _id: null, avgDuration: { $avg: "$properties.durationSeconds" } } }
    ]);
    const avgSessionDuration = sessionStats.length > 0 ? Math.round(sessionStats[0].avgDuration) : 0;

    // 3. Onboarding & Focus conversion funnel
    const funnelResult = await AnalyticsEvent.aggregate([
      {
        $match: {
          eventName: { $in: ['onboarding_started', 'onboarding_completed', 'room_joined', 'pomodoro_completed'] }
        }
      },
      {
        $group: {
          _id: '$userId',
          events: { $push: { name: '$eventName', time: '$timestamp' } }
        }
      }
    ]);

    let step1Count = 0;
    let step2Count = 0;
    let step3Count = 0;
    let step4Count = 0;

    funnelResult.forEach(user => {
      const times = {};
      user.events.forEach(e => {
        if (!times[e.name] || e.time < times[e.name]) {
          times[e.name] = e.time;
        }
      });

      if (times['onboarding_started']) {
        step1Count++;
        if (times['onboarding_completed'] && times['onboarding_completed'] >= times['onboarding_started']) {
          step2Count++;
          if (times['room_joined'] && times['room_joined'] >= times['onboarding_completed']) {
            step3Count++;
            if (times['pomodoro_completed'] && times['pomodoro_completed'] >= times['room_joined']) {
              step4Count++;
            }
          }
        }
      }
    });

    const funnelOnboarding = [
      { step: 'Onboarding Started', count: step1Count, rate: 100 },
      { step: 'Onboarding Completed', count: step2Count, rate: step1Count ? Math.round((step2Count / step1Count) * 100) : 0 },
      { step: 'Room Joined', count: step3Count, rate: step2Count ? Math.round((step3Count / step2Count) * 100) : 0 },
      { step: 'Pomodoro Completed', count: step4Count, rate: step3Count ? Math.round((step4Count / step3Count) * 100) : 0 },
    ];

    // 4. Cohort Retention Utilities
    const User = require('../models/User');
    const allDbUsers = await User.find({});
    const userCohorts = {};
    allDbUsers.forEach(u => {
      const date = u.createdAt || new Date();
      userCohorts[u._id.toString()] = date.toISOString().slice(0, 7);
    });

    const cohortActivity = await AnalyticsEvent.aggregate([
      { $project: { userId: 1, timestamp: 1 } }
    ]);

    const cohorts = {};
    allDbUsers.forEach(u => {
      const m = userCohorts[u._id.toString()];
      if (!cohorts[m]) {
        cohorts[m] = {
          cohortSize: 0,
          weeks: { '0': new Set(), '1': new Set(), '2': new Set(), '3': new Set(), '4': new Set() }
        };
      }
      cohorts[m].cohortSize++;
    });

    cohortActivity.forEach(event => {
      const uid = event.userId;
      const cohortMonth = userCohorts[uid];
      if (!cohortMonth || !cohorts[cohortMonth]) return;

      const userObj = allDbUsers.find(u => u._id.toString() === uid);
      if (!userObj) return;

      const regDate = userObj.createdAt || new Date();
      const eventDate = new Date(event.timestamp);

      const diffTime = eventDate - regDate;
      const diffWeeks = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 7));

      if (diffWeeks >= 0 && diffWeeks <= 4) {
        cohorts[cohortMonth].weeks[diffWeeks.toString()].add(uid);
      }
    });

    const retentionCohorts = Object.entries(cohorts).map(([cohort, data]) => {
      return {
        cohort,
        cohortSize: data.cohortSize,
        retentionRates: {
          week0: 100,
          week1: data.cohortSize ? Math.round((data.weeks['1'].size / data.cohortSize) * 100) : 0,
          week2: data.cohortSize ? Math.round((data.weeks['2'].size / data.cohortSize) * 100) : 0,
          week3: data.cohortSize ? Math.round((data.weeks['3'].size / data.cohortSize) * 100) : 0,
          week4: data.cohortSize ? Math.round((data.weeks['4'].size / data.cohortSize) * 100) : 0,
        }
      };
    });

    // 5. Feature Usage Heatmaps (Grouped by Hour of Day)
    const heatmapResults = await AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: monthAgo } } },
      {
        $project: {
          hour: { $hour: "$timestamp" },
          eventName: 1
        }
      },
      {
        $group: {
          _id: { hour: "$hour", event: "$eventName" },
          count: { $sum: 1 }
        }
      },
      { $sort: { "_id.hour": 1 } }
    ]);

    const featureHeatmap = heatmapResults.map(h => ({
      hour: h._id.hour,
      eventName: h._id.event,
      count: h.count
    }));

    // 6. AI Usage by Tier
    const aiUsageResults = await AnalyticsEvent.aggregate([
      { $match: { eventName: 'ai_prompt_sent', timestamp: { $gte: monthAgo } } },
      {
        $group: {
          _id: "$properties.planTier",
          totalTokens: { $sum: { $ifNull: ["$properties.totalTokens", 0] } },
          estimatedCostUsd: { $sum: { $ifNull: ["$properties.estimatedCostUsd", 0] } },
          count: { $sum: 1 }
        }
      }
    ]);

    const aiUsageByTier = aiUsageResults.map(a => ({
      tier: a._id || 'free',
      totalTokens: a.totalTokens,
      estimatedCostUsd: parseFloat((a.estimatedCostUsd || 0).toFixed(6)),
      count: a.count
    }));

    // 7. Churn Signals (Lost Streaks and Cancellations)
    const churnSignals = [];
    const cancelledSubscribers = await AnalyticsEvent.find({ eventName: 'subscription_cancelled' }).limit(10);
    cancelledSubscribers.forEach(c => {
      churnSignals.push({
        userId: c.userId,
        type: 'Subscription Cancelled',
        timestamp: c.timestamp,
        details: `Downgraded from tier: ${c.properties?.previousTier || 'pro'}`
      });
    });

    const lostStreaks = await AnalyticsEvent.find({ eventName: 'streak_lost' }).limit(10);
    lostStreaks.forEach(s => {
      churnSignals.push({
        userId: s.userId,
        type: 'Streak Lost',
        timestamp: s.timestamp,
        details: `Lost active daily study streak of ${s.properties?.lostStreakDays || 0} days`
      });
    });

    // 8. Top Referral Sources (Converted)
    const referralResults = await AnalyticsEvent.aggregate([
      { $match: { eventName: 'referral_converted' } },
      {
        $group: {
          _id: "$properties.referralCode",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const topReferrals = referralResults.map(r => ({
      referralCode: r._id || 'organic',
      count: r.count
    }));

    res.status(200).json({
      status: 'success',
      data: {
        dau,
        wau,
        mau,
        onboardingCompletionRate: onboardingStarted ? Math.round((onboardingCompleted / onboardingStarted) * 100) : 0,
        focusCompletionRate: focusStarted ? Math.round((focusCompleted / focusStarted) * 100) : 0,
        avgSessionDuration,
        aiInteractionCount,
        featureUsage,
        funnelOnboarding,
        retentionCohorts,
        featureHeatmap,
        aiUsageByTier,
        churnSignals,
        topReferrals
      }
    });
  } catch (error) {
    console.error('Analytics dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
};
