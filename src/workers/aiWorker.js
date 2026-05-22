// src/workers/aiWorker.js
const { Worker } = require('bullmq');
const { connection } = require('../queue/aiQueue');
const User = require('../models/User');
const FocusSession = require('../models/FocusSession');
const AiInsight = require('../models/AiInsight');
const aiCoachService = require('../services/aiCoachService');
const { getIO } = require('../socket');

const aiWorker = new Worker('ai-coach', async (job) => {
  if (job.name === 'generate_summary') {
    const { userId, sessionId } = job.data;
    
    // 1. Gather context
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');

    // Fetch last 10 sessions for context
    const recentSessions = await FocusSession.find({ userId })
      .sort({ createdAt: -1 })
      .limit(10);

    // 2. Call OpenAI Service
    const insightData = await aiCoachService.generateSessionSummary(user, recentSessions);

    // 3. Save Insight to Database
    const insight = await AiInsight.create({
      userId,
      type: insightData.type,
      content: insightData.content
    });

    // 4. Emit Realtime Notification via Socket.IO
    try {
      const io = getIO();
      // Emitting broadly to user's personal channel
      io.emit(`user:${userId}:ai_nudge`, insight);
    } catch (err) {
      console.log('Socket.io not available to emit insight dynamically right now.');
    }

    return insight;
  }
}, { connection });

aiWorker.on('completed', (job) => {
  console.log(`[AI Worker] Job ${job.id} completed successfully`);
});

aiWorker.on('failed', (job, err) => {
  console.error(`[AI Worker] Job ${job.id} failed:`, err.message);
});

module.exports = aiWorker;
