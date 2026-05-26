// src/routes/ai.js
// Production ready Express API router for SaaS AI study assistant services with moderations, cost logs, and histories

const express = require('express');
const { protect } = require('../middleware/auth');
const { requireFeature } = require('../middleware/monetization');
const aiConfig = require('../config/ai');
const aiSafety = require('../utils/aiSafety');
const aiContext = require('../utils/aiContext');
const aiProvider = require('../services/aiProvider');
const { logAuditEvent } = require('../utils/auditLogger');
const Conversation = require('../models/Conversation'); // Persist chat dialogue history

const router = express.Router();

const { slidingWindowRateLimit } = require('../middleware/rateLimiter');
const slidingLimit = slidingWindowRateLimit('ai_assistant', 5, 60000);

/**
 * Perform active OpenAI content moderation check
 * 
 * @param {string} input - User query text
 * @returns {Promise<boolean>} True if flagged as unsafe
 */
async function performModerationCheck(input) {
  if (aiConfig.provider !== 'openai' || !aiConfig.openai.apiKey) {
    return false; // Skip in mock / sandboxed mode
  }

  try {
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.openai.apiKey}`,
      },
      body: JSON.stringify({ input }),
    });

    if (response.ok) {
      const data = await response.json();
      const flagged = data.results && data.results[0] && data.results[0].flagged;
      return Boolean(flagged);
    }
    return false;
  } catch (error) {
    console.warn('[AI Moderation] Moderation check failed, bypassing to local filter:', error.message);
    return false;
  }
}

/**
 * Calculate USD cost for gpt-4o-mini completions
 * 
 * @param {number} promptTokens 
 * @param {number} completionTokens 
 * @returns {number} Estimated cost in USD
 */
function calculateEstimatedCost(promptTokens, completionTokens) {
  // gpt-4o-mini: input is $0.15 / 1M tokens ($0.00000015), output is $0.60 / 1M tokens ($0.00000060)
  const inputCost = promptTokens * 0.00000015;
  const outputCost = completionTokens * 0.00000060;
  return inputCost + outputCost;
}

// ─── AI PLAN-BASED RATE LIMITING MIDDLEWARE ──────────────────────────────────
function enforceAiRateLimits(req, res, next) {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Authentication required' });
    }

    const tier = String(user.tier || 'free').toLowerCase();

    if (tier === 'free') {
      return res.status(403).json({
        error: 'FEATURE_LOCKED',
        message: 'The AI study assistant is a premium feature. Please upgrade to Pro to unlock.',
      });
    }

    if (tier === 'admin') {
      return next();
    }

    // Direct delegation to sliding window Redis rate limiter
    return slidingLimit(req, res, next);
  } catch (error) {
    console.error('[AI Rate Limiter] Error checks failed:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to process AI safety checks' });
  }
}

// All AI assistant routes require authentication
router.use(protect);

/**
 * POST /api/v1/ai/chat
 * General purpose academic chat tutoring response
 */
router.post('/chat', requireFeature('ai_chat'), enforceAiRateLimits, async (req, res) => {
  const startTime = Date.now();
  let rawPrompt = req.body.prompt;

  try {
    if (!rawPrompt || typeof rawPrompt !== 'string') {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A prompt text string is required' });
    }

    const prompt = aiSafety.sanitizePrompt(rawPrompt);

    if (!aiSafety.validatePromptSize(prompt)) {
      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: `Your prompt exceeds the character limit of ${aiConfig.safety.promptCharLimit} symbols.`,
      });
    }

    if (aiSafety.detectPromptInjection(prompt)) {
      logAuditEvent({
        action: 'ai_failure',
        userId: req.user._id,
        previousTier: req.user.tier || 'free',
        resource: req.originalUrl,
        success: false,
        metadata: { reason: 'Local prompt injection detected' },
      });

      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: 'Instruction override or prompt injection attempt detected. Completion blocked.',
      });
    }

    // 1. OpenAI Content Moderation check
    const isUnsafe = await performModerationCheck(prompt);
    if (isUnsafe) {
      logAuditEvent({
        action: 'ai_failure',
        userId: req.user._id,
        previousTier: req.user.tier || 'free',
        resource: req.originalUrl,
        success: false,
        metadata: { reason: 'OpenAI Content Moderation violation flagged' },
      });

      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: 'This query contains content flagged as unsafe by academic AI safety rules.',
      });
    }

    logAuditEvent({
      action: 'ai_request',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: { provider: aiConfig.provider, promptLength: prompt.length },
    });

    // 2. Generate Completion with Timeout
    const result = await aiSafety.wrapTimeout(
      aiProvider.generateCompletion({ prompt })
    );

    // Calculate estimated USD costs
    const promptTokens = result.usage?.promptTokens || 0;
    const completionTokens = result.usage?.completionTokens || 0;
    const estimatedCostUsd = calculateEstimatedCost(promptTokens, completionTokens);

    logAuditEvent({
      action: 'ai_response',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: {
        provider_used: result.provider,
        tokens_used: result.usage?.totalTokens || 0,
        estimatedCostUsd,
        durationMs: Date.now() - startTime,
      },
    });

    console.log(`🤖 [AI Cost Audit] Completed via ${result.provider}. Tokens: ${promptTokens + completionTokens} | Est. Cost: $${estimatedCostUsd.toFixed(6)}`);

    // 3. Persist Dialogue to MongoDB Conversation logs
    let conversation = await Conversation.findOne({ userId: req.user._id, roomId: null });
    if (!conversation) {
      conversation = new Conversation({ userId: req.user._id, messages: [] });
    }
    conversation.messages.push({ sender: 'user', text: prompt });
    conversation.messages.push({ sender: 'ai', text: result.response });
    await conversation.save();

    // Award AI chat XP & check achievement
    const xpService = require('../services/xpService');
    const achievementService = require('../services/achievementService');
    await xpService.awardXp(req.user._id, 'AI_CHAT');
    await achievementService.checkAndUnlock(req.user._id, 'FIRST_AI');

    return res.json({
      success: true,
      ...result,
      estimatedCostUsd,
    });
  } catch (error) {
    console.error('[AI Chat API] Provider completion exception:', error);

    logAuditEvent({
      action: 'ai_failure',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: false,
      metadata: { error: error.message },
    });

    const fallback = aiSafety.getSafeFallback(error, 'chat');
    return res.json({
      success: true,
      ...fallback,
      estimatedCostUsd: 0,
    });
  }
});

/**
 * POST /api/v1/ai/summarize
 * Summarizes the last 50 room chat messages
 */
router.post('/summarize', requireFeature('ai_summaries'), enforceAiRateLimits, async (req, res) => {
  const startTime = Date.now();
  const { roomId } = req.body;

  try {
    if (!roomId) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Room ID is required to generate summary' });
    }

    const { room, messages, contextText } = await aiContext.buildRoomContext(roomId);
    
    if (messages.length === 0) {
      return res.json({
        success: true,
        response: 'There is currently no chat conversation logs recorded in this study room to summarize. Feel free to start chatting!',
        provider: 'mock',
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        timestamp: new Date().toISOString(),
      });
    }

    const summarizePrompt = `Please compile a brief, engaging summary of the primary study topics, accountability updates, and discussions inside the following focus session logs. Format it with bullet points if helpful:\n\n${contextText}`;

    logAuditEvent({
      action: 'ai_request',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: { provider: aiConfig.provider, action: 'room_summary', roomId },
    });

    const result = await aiSafety.wrapTimeout(
      aiProvider.generateCompletion({
        prompt: summarizePrompt,
        systemPrompt: 'You are an expert academic summarizer. Review study logs and summarize key discussion points concisely.',
      })
    );

    const promptTokens = result.usage?.promptTokens || 0;
    const completionTokens = result.usage?.completionTokens || 0;
    const estimatedCostUsd = calculateEstimatedCost(promptTokens, completionTokens);

    logAuditEvent({
      action: 'ai_response',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: {
        provider_used: result.provider,
        tokens_used: result.usage?.totalTokens || 0,
        estimatedCostUsd,
        durationMs: Date.now() - startTime,
        roomId,
      },
    });

    // Award AI chat XP
    const xpService = require('../services/xpService');
    await xpService.awardXp(req.user._id, 'AI_CHAT');

    return res.json({
      success: true,
      ...result,
      estimatedCostUsd,
    });
  } catch (error) {
    console.error('[AI Summarize API] Exception:', error);

    logAuditEvent({
      action: 'ai_failure',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: false,
      metadata: { error: error.message, roomId },
    });

    const fallback = aiSafety.getSafeFallback(error, 'summarize');
    return res.json({
      success: true,
      ...fallback,
      estimatedCostUsd: 0,
    });
  }
});

/**
 * POST /api/v1/ai/room-assistant
 * Answer questions about study room context and chat logs
 */
router.post('/room-assistant', requireFeature('ai_rooms'), enforceAiRateLimits, async (req, res) => {
  const startTime = Date.now();
  const { roomId, prompt: rawPrompt } = req.body;

  try {
    if (!roomId) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Room ID is required to access assistant' });
    }

    if (!rawPrompt || typeof rawPrompt !== 'string') {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'A prompt question string is required' });
    }

    const cleanPrompt = aiSafety.sanitizePrompt(rawPrompt);

    if (!aiSafety.validatePromptSize(cleanPrompt)) {
      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: `Your query exceeds the character limit of ${aiConfig.safety.promptCharLimit} symbols.`,
      });
    }

    if (aiSafety.detectPromptInjection(cleanPrompt)) {
      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: 'Instruction override or prompt injection attempt detected. Completion blocked.',
      });
    }

    // OpenAI Content Moderation check
    const isUnsafe = await performModerationCheck(cleanPrompt);
    if (isUnsafe) {
      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: 'This query contains content flagged as unsafe by academic AI safety rules.',
      });
    }

    const { contextText } = await aiContext.buildRoomContext(roomId);
    const contextualPrompt = `You are a focus peer answering a question about the active study session. Below is the room metadata and chat history. Keep answers extremely precise, utilizing the context data if possible.\n\n${contextText}\n\nUser Question: ${cleanPrompt}`;

    logAuditEvent({
      action: 'ai_request',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: { provider: aiConfig.provider, action: 'room_assistant', roomId },
    });

    const result = await aiSafety.wrapTimeout(
      aiProvider.generateCompletion({ prompt: contextualPrompt })
    );

    const promptTokens = result.usage?.promptTokens || 0;
    const completionTokens = result.usage?.completionTokens || 0;
    const estimatedCostUsd = calculateEstimatedCost(promptTokens, completionTokens);

    logAuditEvent({
      action: 'ai_response',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: {
        provider_used: result.provider,
        tokens_used: result.usage?.totalTokens || 0,
        estimatedCostUsd,
        durationMs: Date.now() - startTime,
        roomId,
      },
    });

    // Persist Room Dialogue history
    let conversation = await Conversation.findOne({ userId: req.user._id, roomId });
    if (!conversation) {
      conversation = new Conversation({ userId: req.user._id, roomId, messages: [] });
    }
    conversation.messages.push({ sender: 'user', text: cleanPrompt });
    conversation.messages.push({ sender: 'ai', text: result.response });
    await conversation.save();

    // Award AI chat XP
    const xpService = require('../services/xpService');
    await xpService.awardXp(req.user._id, 'AI_CHAT');

    return res.json({
      success: true,
      ...result,
      estimatedCostUsd,
    });
  } catch (error) {
    console.error('[AI Room Assistant API] Exception:', error);

    logAuditEvent({
      action: 'ai_failure',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: false,
      metadata: { error: error.message, roomId },
    });

    const fallback = aiSafety.getSafeFallback(error, 'room-assistant');
    return res.json({
      success: true,
      ...fallback,
      estimatedCostUsd: 0,
    });
  }
});

module.exports = {
  router,
};
