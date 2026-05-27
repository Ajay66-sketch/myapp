// src/queue/aiQueue.js
// Production-safe AI Coach queue that handles intensive user cognitive insight generation

const ResilientQueue = require('./baseQueue');
const User = require('../models/User');
const FocusSession = require('../models/FocusSession');
const AiInsight = require('../models/AiInsight');
const aiCoachService = require('../services/aiCoachService');

// Lazy getter for Socket.IO connection
const getIO = () => {
  try {
    return require('../socket').getIO();
  } catch (err) {
    return null;
  }
};

/**
 * Core AI Coach task processor. Resolves context and generates personalized summaries.
 */
async function processAiCoachJob(jobData) {
  const { userId, sessionId } = jobData;
  if (!userId) throw new Error('Cannot process AI Coach job: Missing userId');

  // 1. Gather study context
  const user = await User.findById(userId);
  if (!user) throw new Error(`User not found: ${userId}`);

  // Fetch last 10 sessions for detailed analysis context
  const recentSessions = await FocusSession.find({ userId })
    .sort({ createdAt: -1 })
    .limit(10);

  console.log(`🤖 [AI Coach Processor] Generating study analysis for user ${user.username} (sessions analyzed: ${recentSessions.length})`);

  // 2. Query LLM service
  const insightData = await aiCoachService.generateSessionSummary(user, recentSessions);

  // 3. Persist generated insight
  const insight = await AiInsight.create({
    userId,
    type: insightData.type,
    content: insightData.content
  });

  // 4. Send real-time updates to connected client
  try {
    const io = getIO();
    if (io) {
      io.emit(`user:${userId}:ai_nudge`, insight);
    }
  } catch (err) {
    console.warn('[AI Coach Processor] Realtime socket nudge skipped:', err.message);
  }

  return insight;
}

// Instantiate resilient queue
const aiQueue = new ResilientQueue('ai-coach', processAiCoachJob, {
  maxRetries: 3,
  initialDelayMs: 5000 // 5 seconds initial delay before exponential retry
});

module.exports = {
  aiQueue,
  processAiCoachJob
};
