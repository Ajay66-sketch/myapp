// src/controllers/analytics.js
const AnalyticsEvent = require('../models/AnalyticsEvent');
const mongoose = require('mongoose');

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
          dau: 42,
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
          ]
        }
      });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const dauResult = await AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: todayStart } } },
      { $group: { _id: "$userId" } },
      { $count: "dau" }
    ]);
    const dau = dauResult.length > 0 ? dauResult[0].dau : 0;

    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const featureUsage = await AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: thirtyDaysAgo } } },
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

    res.status(200).json({
      status: 'success',
      data: {
        dau,
        onboardingCompletionRate: onboardingStarted ? Math.round((onboardingCompleted / onboardingStarted) * 100) : 0,
        focusCompletionRate: focusStarted ? Math.round((focusCompleted / focusStarted) * 100) : 0,
        avgSessionDuration,
        aiInteractionCount,
        featureUsage
      }
    });
  } catch (error) {
    console.error('Analytics dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch metrics' });
  }
};
