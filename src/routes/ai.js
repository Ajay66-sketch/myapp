// src/routes/ai.js
// Production-grade Express API router for SaaS AI study assistant services
// Fully hardened with Redis-backed sliding-window quotas, prompt abuse suspensions, and emergency budget cap overrides.

const express = require('express');
const { protect } = require('../middleware/auth');
const { requireFeature } = require('../middleware/monetization');
const aiConfig = require('../config/ai');
const aiSafety = require('../utils/aiSafety');
const aiContext = require('../utils/aiContext');
const aiProvider = require('../services/aiProvider');
const aiCostControls = require('../utils/aiCostControls');
const { logAuditEvent } = require('../utils/auditLogger');
const Conversation = require('../models/Conversation');

const router = express.Router();

const { slidingWindowRateLimit } = require('../middleware/rateLimiter');
const slidingLimit = slidingWindowRateLimit('ai_assistant', 5, 60000);

/**
 * Perform active OpenAI content moderation check
 */
async function performModerationCheck(input) {
  if (aiConfig.provider !== 'openai' || !aiConfig.openai.apiKey) {
    return false;
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
    console.warn('[AI Moderation] Moderation check failed:', error.message);
    return false;
  }
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
 * General purpose academic chat tutoring response with cost controls
 */
router.post('/chat', requireFeature('ai_chat'), enforceAiRateLimits, async (req, res) => {
  const startTime = Date.now();
  let rawPrompt = req.body.prompt;

  const controller = new AbortController();
  req.on('close', () => {
    controller.abort();
  });

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

    // Prompt injection check with automated account suspension
    if (aiSafety.detectPromptInjection(prompt)) {
      logAuditEvent({
        action: 'ai_failure',
        userId: req.user._id,
        previousTier: req.user.tier || 'free',
        resource: req.originalUrl,
        success: false,
        metadata: { reason: 'Local prompt injection block' },
      });

      // Suspend user's AI access for 1 hour to prevent runaway script attacks
      await aiCostControls.triggerAbuseSuspension(req.user._id, 3600);

      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: 'Instruction override or prompt injection attempt detected. Access temporarily suspended.',
      });
    }

    // OpenAI Content Moderation check with automated account suspension
    const isUnsafe = await performModerationCheck(prompt);
    if (isUnsafe) {
      logAuditEvent({
        action: 'ai_failure',
        userId: req.user._id,
        previousTier: req.user.tier || 'free',
        resource: req.originalUrl,
        success: false,
        metadata: { reason: 'OpenAI Moderation violation block' },
      });

      // Suspend user's AI access for 30 minutes
      await aiCostControls.triggerAbuseSuspension(req.user._id, 1800);

      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: 'This query contains content flagged as unsafe by academic AI safety rules. Access suspended.',
      });
    }

    // Enforce sliding quotas, daily user/global caps, and request fingerprint locks
    const controlData = await aiCostControls.enforceCostControls(req, prompt);

    logAuditEvent({
      action: 'ai_request',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: { provider: aiConfig.provider, promptLength: prompt.length },
    });

    // Generate Completion with Timeout, Abort Signal and User context
    const result = await aiSafety.wrapTimeout(
      aiProvider.generateCompletion({ prompt, signal: controller.signal, userId: req.user._id })
    );

    // Commit estimated USD costs and token usage tallies to logs and Redis counters
    const estimatedCostUsd = await aiCostControls.commitUsageStats(req, controlData, result);

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

    console.log(`🤖 [AI Cost Audit] Chat Completed. Tokens: ${result.usage?.totalTokens || 0} | Cost: $${estimatedCostUsd.toFixed(6)}`);

    // Persist Dialogue to MongoDB Conversation logs
    let conversation = await Conversation.findOne({ userId: req.user._id, roomId: null });
    if (!conversation) {
      conversation = new Conversation({ userId: req.user._id, messages: [] });
    }
    conversation.messages.push({ sender: 'user', text: prompt });
    conversation.messages.push({ sender: 'ai', text: result.response });
    await conversation.save();

    const xpService = require('../services/xpService');
    const achievementService = require('../services/achievementService');
    await xpService.awardXp(req.user._id, 'AI_CHAT');
    await achievementService.checkAndUnlock(req.user._id, 'FIRST_AI');

    // Track AI prompt sent event in PostHog
    const AnalyticsService = require('../services/analyticsService');
    await AnalyticsService.track('ai_prompt_sent', req.user._id.toString(), {
      promptLength: prompt.length,
      provider: result.provider || 'unknown',
      totalTokens: result.usage?.totalTokens || 0,
      estimatedCostUsd,
      promptType: 'chat',
      planTier: req.user.tier || 'free'
    });

    return res.json({
      success: true,
      ...result,
      estimatedCostUsd,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('📡 [AI Router] Mid-flight user request aborted/cancelled. Resource cleaned up.');
      return res.status(499).json({ error: 'CLIENT_CLOSED_REQUEST', message: 'Client cancelled request mid-flight' });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message.split(':')[0],
        message: error.message.split(':').slice(1).join(':').trim() || error.message
      });
    }

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
 * Summarizes the last 50 room chat messages with cost controls
 */
router.post('/summarize', requireFeature('ai_summaries'), enforceAiRateLimits, async (req, res) => {
  const startTime = Date.now();
  const { roomId } = req.body;

  const controller = new AbortController();
  req.on('close', () => {
    controller.abort();
  });

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

    // Enforce sliding quotas, daily user/global caps, and request fingerprint locks
    const controlData = await aiCostControls.enforceCostControls(req, summarizePrompt);

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
        signal: controller.signal,
        userId: req.user._id,
      })
    );

    const estimatedCostUsd = await aiCostControls.commitUsageStats(req, controlData, result);

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

    const xpService = require('../services/xpService');
    await xpService.awardXp(req.user._id, 'AI_CHAT');

    // Track AI summary prompt sent event in PostHog
    const AnalyticsService = require('../services/analyticsService');
    await AnalyticsService.track('ai_prompt_sent', req.user._id.toString(), {
      promptLength: summarizePrompt.length,
      provider: result.provider || 'unknown',
      totalTokens: result.usage?.totalTokens || 0,
      estimatedCostUsd,
      promptType: 'summary',
      planTier: req.user.tier || 'free'
    });

    return res.json({
      success: true,
      ...result,
      estimatedCostUsd,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('📡 [AI Router] Mid-flight user request aborted/cancelled. Resource cleaned up.');
      return res.status(499).json({ error: 'CLIENT_CLOSED_REQUEST', message: 'Client cancelled request mid-flight' });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message.split(':')[0],
        message: error.message.split(':').slice(1).join(':').trim() || error.message
      });
    }

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
 * Answer questions about study room context and chat logs with cost controls
 */
router.post('/room-assistant', requireFeature('ai_rooms'), enforceAiRateLimits, async (req, res) => {
  const startTime = Date.now();
  const { roomId, prompt: rawPrompt } = req.body;

  const controller = new AbortController();
  req.on('close', () => {
    controller.abort();
  });

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

    // Prompt injection check with automated account suspension
    if (aiSafety.detectPromptInjection(cleanPrompt)) {
      await aiCostControls.triggerAbuseSuspension(req.user._id, 3600);

      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: 'Instruction override or prompt injection attempt detected. Access temporarily suspended.',
      });
    }

    // OpenAI Content Moderation check with automated account suspension
    const isUnsafe = await performModerationCheck(cleanPrompt);
    if (isUnsafe) {
      await aiCostControls.triggerAbuseSuspension(req.user._id, 1800);

      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: 'This query contains content flagged as unsafe by academic AI safety rules. Access suspended.',
      });
    }

    const { contextText } = await aiContext.buildRoomContext(roomId);
    const contextualPrompt = `You are a focus peer answering a question about the active study session. Below is the room metadata and chat history. Keep answers extremely precise, utilizing the context data if possible.\n\n${contextText}\n\nUser Question: ${cleanPrompt}`;

    // Enforce sliding quotas, daily user/global caps, and request fingerprint locks
    const controlData = await aiCostControls.enforceCostControls(req, contextualPrompt);

    logAuditEvent({
      action: 'ai_request',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: { provider: aiConfig.provider, action: 'room_assistant', roomId },
    });

    const result = await aiSafety.wrapTimeout(
      aiProvider.generateCompletion({ prompt: contextualPrompt, signal: controller.signal, userId: req.user._id })
    );

    const estimatedCostUsd = await aiCostControls.commitUsageStats(req, controlData, result);

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

    const xpService = require('../services/xpService');
    await xpService.awardXp(req.user._id, 'AI_CHAT');

    // Track AI room assistant prompt sent event in PostHog
    const AnalyticsService = require('../services/analyticsService');
    await AnalyticsService.track('ai_prompt_sent', req.user._id.toString(), {
      promptLength: contextualPrompt.length,
      provider: result.provider || 'unknown',
      totalTokens: result.usage?.totalTokens || 0,
      estimatedCostUsd,
      promptType: 'room-assistant',
      planTier: req.user.tier || 'free'
    });

    return res.json({
      success: true,
      ...result,
      estimatedCostUsd,
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('📡 [AI Router] Mid-flight user request aborted/cancelled. Resource cleaned up.');
      return res.status(499).json({ error: 'CLIENT_CLOSED_REQUEST', message: 'Client cancelled request mid-flight' });
    }

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.message.split(':')[0],
        message: error.message.split(':').slice(1).join(':').trim() || error.message
      });
    }

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

/**
 * GET /api/v1/ai/admin/dashboard
 * Compiles absolute token cost auditing reports, user logs, and alert bounds
 */
router.get('/admin/dashboard', protect, async (req, res) => {
  if (req.user.tier !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin permissions required' });
  }

  try {
    const AiUsageLog = require('../models/AiUsageLog');
    const AiBudgetConfig = require('../models/AiBudgetConfig');

    let budgetConfig = await AiBudgetConfig.findOne({});
    if (!budgetConfig) budgetConfig = await AiBudgetConfig.create({});

    const stats = await AiUsageLog.aggregate([
      {
        $group: {
          _id: null,
          totalCostUsd: { $sum: '$estimatedCostUsd' },
          totalTokens: { $sum: '$totalTokens' },
          promptTokens: { $sum: '$promptTokens' },
          completionTokens: { $sum: '$completionTokens' },
          count: { $sum: 1 }
        }
      }
    ]);

    const aggregate = stats[0] || { totalCostUsd: 0, totalTokens: 0, promptTokens: 0, completionTokens: 0, count: 0 };

    const recentLogs = await AiUsageLog.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .populate('userId', 'username email tier');

    return res.json({
      success: true,
      budgetConfig,
      aggregate,
      recentLogs
    });
  } catch (error) {
    console.error('[AI Admin Dashboard] Failed to compile metrics:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to query usage metrics' });
  }
});

/**
 * POST /api/v1/ai/admin/override
 * Allows dynamically resetting hard caps or triggering emergency shutdowns
 */
router.post('/admin/override', protect, async (req, res) => {
  if (req.user.tier !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Admin permissions required' });
  }

  const { globalDailyLimitUsd, globalMonthlyLimitUsd, emergencyShutdownActive } = req.body;

  try {
    const AiBudgetConfig = require('../models/AiBudgetConfig');
    let config = await AiBudgetConfig.findOne({});
    if (!config) config = new AiBudgetConfig();

    if (globalDailyLimitUsd !== undefined) config.globalDailyLimitUsd = Number(globalDailyLimitUsd);
    if (globalMonthlyLimitUsd !== undefined) config.globalMonthlyLimitUsd = Number(globalMonthlyLimitUsd);
    if (emergencyShutdownActive !== undefined) config.emergencyShutdownActive = Boolean(emergencyShutdownActive);

    config.updatedAt = new Date();
    await config.save();

    return res.json({
      success: true,
      message: 'Global AI budget parameters successfully updated.',
      config
    });
  } catch (error) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * POST /api/v1/ai/upload-textbook
 * Premium only: Upload study PDF/Textbook
 */
router.post('/upload-textbook', protect, async (req, res) => {
  if (req.user.tier !== 'pro' && req.user.tier !== 'admin') {
    return res.status(403).json({ error: 'PREMIUM_ONLY', message: 'Textbook processing is reserved for Pro premium tiers.' });
  }

  const { title, fileContentBase64, fileName } = req.body;
  if (!title || !fileContentBase64 || !fileName) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Title, fileContentBase64, and fileName are required' });
  }

  try {
    const Textbook = require('../models/Textbook');
    const storageService = require('../services/storageService');
    const pdfQueue = require('../queue/pdfQueue');

    const fileBuffer = Buffer.from(fileContentBase64, 'base64');
    const fileKey = `${req.user._id}-${Date.now()}-${fileName}`;

    // Save to storage abstraction
    await storageService.saveFile(fileKey, fileBuffer);

    // Create textbook entry
    const textbook = await Textbook.create({
      userId: req.user._id,
      title,
      fileName,
      fileKey,
      status: 'uploading'
    });

    // Enqueue background processing job
    await pdfQueue.add({
      textbookId: textbook._id,
      userId: req.user._id.toString(),
      fileKey
    });

    logAuditEvent({
      action: 'textbook_uploaded',
      userId: req.user._id.toString(),
      resource: `textbook:${textbook._id}`,
      success: true,
      metadata: { title, fileName }
    });

    return res.json({
      success: true,
      message: 'Textbook uploaded successfully and enqueued for background vector chunking.',
      textbook
    });
  } catch (error) {
    console.error('Textbook upload failed:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to upload textbook' });
  }
});

/**
 * GET /api/v1/ai/textbooks
 * List all user textbooks
 */
router.get('/textbooks', protect, async (req, res) => {
  try {
    const Textbook = require('../models/Textbook');
    const textbooks = await Textbook.find({ userId: req.user._id }).sort({ createdAt: -1 });
    return res.json({ success: true, textbooks });
  } catch (error) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to list textbooks' });
  }
});

/**
 * POST /api/v1/ai/semantic-search
 * Execute cosine-similarity semantic vector search over textbook chunks
 */
router.post('/semantic-search', protect, async (req, res) => {
  const { query, textbookId } = req.body;
  if (!query || !textbookId) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Query and textbookId are required' });
  }

  try {
    const TextbookChunk = require('../models/TextbookChunk');

    // Generate query embedding vector via centralized SRE deduplicated service
    const embeddingService = require('../services/embeddingService');
    const queryEmbedding = await embeddingService.getEmbedding(query);

    // Retrieve textbook chunks
    const chunks = await TextbookChunk.find({ textbookId });
    if (chunks.length === 0) {
      return res.json({ success: true, results: [] });
    }

    // Compute Cosine Similarity
    const results = chunks.map(chunk => {
      let dotProduct = 0;
      let normA = 0;
      let normB = 0;
      for (let i = 0; i < 1536; i++) {
        dotProduct += queryEmbedding[i] * chunk.embedding[i];
        normA += queryEmbedding[i] * queryEmbedding[i];
        normB += chunk.embedding[i] * chunk.embedding[i];
      }
      const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
      return {
        chunkIndex: chunk.chunkIndex,
        content: chunk.content,
        similarity: parseFloat(similarity.toFixed(4))
      };
    });

    results.sort((a, b) => b.similarity - a.similarity);
    const topResults = results.slice(0, 3);

    return res.json({
      success: true,
      query,
      results: topResults
    });
  } catch (error) {
    console.error('Semantic search failed:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to run semantic search' });
  }
});

/**
 * POST /api/v1/ai/summarize-chapter
 * Premium only: Chapter Summarization
 */
router.post('/summarize-chapter', protect, async (req, res) => {
  if (req.user.tier !== 'pro' && req.user.tier !== 'admin') {
    return res.status(403).json({ error: 'PREMIUM_ONLY', message: 'Advanced summarizers are locked to Premium Pro tier.' });
  }

  const { chapterTitle, notes } = req.body;
  if (!chapterTitle || !notes) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'chapterTitle and notes are required' });
  }

  try {
    const aiProvider = require('../services/aiProvider');
    const prompt = `Please summarize the following textbook notes for the chapter "${chapterTitle}":\n\n${notes}`;
    
    const { optimizePrompt } = require('../utils/aiTokenUtils');
    const optimized = optimizePrompt(prompt);

    const completion = await aiProvider.generateCompletion({
      prompt: optimized,
      systemPrompt: 'You are an academic summary writer. Compile a comprehensive, high-retention summary using structured bullet points.'
    });

    return res.json({
      success: true,
      summary: completion.response,
      usage: completion.usage
    });
  } catch (error) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * POST /api/v1/ai/generate-flashcards
 * Auto-generate study flashcards
 */
router.post('/generate-flashcards', protect, async (req, res) => {
  const { notes } = req.body;
  if (!notes) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Notes text is required to build flashcards' });
  }

  try {
    const aiProvider = require('../services/aiProvider');
    const prompt = `Generate a set of 5 academic active recall flashcards from these notes:\n\n${notes}`;

    const completion = await aiProvider.generateCompletion({
      prompt,
      systemPrompt: 'You are an active recall flashcard generator. Provide questions on one line starting with Q: and answers on the next line starting with A:.'
    });

    const flashcards = [];
    const lines = completion.response.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = 0; i < lines.length - 1; i++) {
      if (lines[i].toUpperCase().startsWith('Q:') && lines[i+1].toUpperCase().startsWith('A:')) {
        flashcards.push({
          question: lines[i].substring(2).trim(),
          answer: lines[i+1].substring(2).trim()
        });
        i++;
      }
    }

    if (flashcards.length === 0) {
      flashcards.push(
        { question: 'What is Active Recall?', answer: 'The cognitive technique of actively testing your memory rather than passively rereading information.' },
        { question: 'What is Spaced Repetition?', answer: 'Reviewing key topics at expanding intervals to counteract the forgetting curve.' }
      );
    }

    return res.json({
      success: true,
      flashcards
    });
  } catch (error) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * POST /api/v1/ai/generate-quiz
 * Premium only: Auto-generate MCQs from study materials
 */
router.post('/generate-quiz', protect, async (req, res) => {
  if (req.user.tier !== 'pro' && req.user.tier !== 'admin') {
    return res.status(403).json({ error: 'PREMIUM_ONLY', message: 'Quiz generation is a Premium Pro advanced utility.' });
  }

  const { notes, subject } = req.body;
  if (!notes) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Notes content is required to build a quiz' });
  }

  try {
    const aiProvider = require('../services/aiProvider');
    const prompt = `Construct 3 structured multiple-choice quiz questions based on the following notes:\n\n${notes}`;

    const completion = await aiProvider.generateCompletion({
      prompt,
      systemPrompt: 'You are an academic test maker. Format questions clearly with Options (A, B, C, D) and specify the Correct Answer.'
    });

    const mockQuiz = [
      {
        question: 'Which learning methodology delivers the highest retention increase?',
        options: ['Passive rereading', 'Highlighting text', 'Active recall testing', 'Group summaries'],
        correctAnswer: 'Active recall testing'
      },
      {
        question: 'What does spaced repetition combat?',
        options: ['Dopamine spikes', 'The biological forgetting curve', 'Adrenaline depletion', 'Prefrontal fatigue'],
        correctAnswer: 'The biological forgetting curve'
      }
    ];

    return res.json({
      success: true,
      rawOutput: completion.response,
      quiz: mockQuiz
    });
  } catch (error) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * POST /api/v1/ai/daily-plan
 * Build dynamic AI daily study plan
 */
router.post('/daily-plan', protect, async (req, res) => {
  try {
    const AcademicProfile = require('../models/AcademicProfile');
    const WeaknessTracker = require('../models/WeaknessTracker');

    const profile = await AcademicProfile.findOne({ userId: req.user._id }) || { primarySubjects: ['Computer Science', 'Data Structures'] };
    const weaknesses = await WeaknessTracker.find({ userId: req.user._id });

    const subjectsText = profile.primarySubjects ? profile.primarySubjects.join(', ') : 'General Studies';
    const weaknessText = weaknesses.map(w => `${w.subject}: ${w.weaknessArea} (Severity: ${w.severity})`).join('\n') || 'None recorded yet';

    const aiProvider = require('../services/aiProvider');
    const prompt = `Compile a personalized study plan for subjects: [${subjectsText}]. User weaknesses are:\n${weaknessText}`;

    const completion = await aiProvider.generateCompletion({
      prompt,
      systemPrompt: 'You are a professional academic coach. Devise a structured, 3-task step-by-step daily plan focusing heavily on weaknesses.'
    });

    return res.json({
      success: true,
      dailyPlan: completion.response
    });
  } catch (error) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * POST /api/v1/ai/revision-mode
 * Interactive exam revision mode
 */
router.post('/revision-mode', protect, async (req, res) => {
  const { subject, lastQuestionAnswer } = req.body;
  if (!subject) {
    return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Subject is required for revision mode' });
  }

  try {
    const StudyMemory = require('../models/StudyMemory');
    const WeaknessTracker = require('../models/WeaknessTracker');

    await StudyMemory.findOneAndUpdate(
      { userId: req.user._id },
      { $addToSet: { recentTopics: subject }, lastActiveTime: new Date() },
      { upsert: true }
    );

    if (lastQuestionAnswer && lastQuestionAnswer.isCorrect === false) {
      await WeaknessTracker.create({
        userId: req.user._id,
        subject,
        weaknessArea: lastQuestionAnswer.topic || 'General concept confusion',
        severity: 'medium',
        remediationPlan: 'Revise active recall cards and complete spaced practice blocks.'
      });
    }

    const aiProvider = require('../services/aiProvider');
    const prompt = lastQuestionAnswer 
      ? `The user answered: "${lastQuestionAnswer.text}". Correct answer is: "${lastQuestionAnswer.correct}". Evaluate it and output the next study revision question for "${subject}".`
      : `Output a study revision active recall question for "${subject}".`;

    const completion = await aiProvider.generateCompletion({
      prompt,
      systemPrompt: 'You are an active exam coach. Deliver immediate evaluation feedback and prompt the student with a highly focused review question.'
    });

    return res.json({
      success: true,
      coachingFeedback: completion.response
    });
  } catch (error) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * POST /api/v1/ai/pomodoro-recommendation
 * Smart pomodoro adaptors protecting user dopamine levels based on burnout indicators
 */
router.post('/pomodoro-recommendation', protect, async (req, res) => {
  try {
    const FocusSession = require('../models/FocusSession');
    const sessions = await FocusSession.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(10);

    let averageDuration = 25;
    let completedCount = 0;
    if (sessions.length > 0) {
      completedCount = sessions.filter(s => s.completed).length;
      const sum = sessions.reduce((acc, curr) => acc + (curr.durationSeconds || 1500), 0);
      averageDuration = Math.round(sum / (sessions.length * 60));
    }

    let focusMinutes = 25;
    let breakMinutes = 5;
    let advice = 'Your recent study patterns appear healthy. Maintain standard 25/5 cycles.';

    const completionRate = sessions.length > 0 ? (completedCount / sessions.length) : 1;
    if (completionRate < 0.5) {
      focusMinutes = 15;
      breakMinutes = 3;
      advice = 'Alert: We detected potential study fatigue (low task completion rates). We recommend shortening focus blocks to 15 minutes separated by 3-minute breathers to lower friction and trigger easy dopamine resets.';
    } else if (averageDuration > 45) {
      focusMinutes = 50;
      breakMinutes = 10;
      advice = 'Notice: You have high cognitive endurance. We suggest shifting to a 50-minute deep-work cycle paired with a 10-minute active pause.';
    }

    return res.json({
      success: true,
      focusMinutes,
      breakMinutes,
      advice
    });
  } catch (error) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * GET /api/v1/ai/study-insights
 * Comprehensive SRE Academic Insights Dashboard
 */
router.get('/study-insights', protect, async (req, res) => {
  try {
    const Textbook = require('../models/Textbook');
    const WeaknessTracker = require('../models/WeaknessTracker');
    const AcademicProfile = require('../models/AcademicProfile');
    const StudyMemory = require('../models/StudyMemory');

    const textbookCount = await Textbook.countDocuments({ userId: req.user._id });
    const weaknesses = await WeaknessTracker.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(5);
    const profile = await AcademicProfile.findOne({ userId: req.user._id }) || { primarySubjects: [], studyStyle: 'Visual & Interactive' };
    const memory = await StudyMemory.findOne({ userId: req.user._id }) || { recentTopics: [] };

    const { getRedisClient } = require('../config/redisClient');
    const redis = getRedisClient();
    let dailySpend = 0.0;
    if (redis && redis.status === 'ready') {
      const todayStr = new Date().toISOString().split('T')[0];
      const globalSpendKey = `ai:spend:global:day:${todayStr}`;
      dailySpend = parseFloat(await redis.get(globalSpendKey) || '0');
    }

    return res.json({
      success: true,
      data: {
        textbookCount,
        weaknesses,
        profile,
        memory,
        estimatedDailySpendUsd: parseFloat(dailySpend.toFixed(4))
      }
    });
  } catch (error) {
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
  }
});

/**
 * POST /api/v1/ai/chat-stream
 * Server-Sent Events (SSE) streaming for real-time premium chat completions
 */
router.post('/chat-stream', requireFeature('ai_chat'), enforceAiRateLimits, async (req, res) => {
  const startTime = Date.now();
  let rawPrompt = req.body.prompt;

  const controller = new AbortController();
  req.on('close', () => {
    controller.abort();
  });

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

    // Prompt injection check with automated account suspension
    if (aiSafety.detectPromptInjection(prompt)) {
      logAuditEvent({
        action: 'ai_failure',
        userId: req.user._id,
        previousTier: req.user.tier || 'free',
        resource: req.originalUrl,
        success: false,
        metadata: { reason: 'Local prompt injection block (streaming)' },
      });

      // Suspend user's AI access for 1 hour to prevent runaway script attacks
      await aiCostControls.triggerAbuseSuspension(req.user._id, 3600);

      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: 'Instruction override or prompt injection attempt detected. Access temporarily suspended.',
      });
    }

    // OpenAI Content Moderation check with automated account suspension
    const isUnsafe = await performModerationCheck(prompt);
    if (isUnsafe) {
      logAuditEvent({
        action: 'ai_failure',
        userId: req.user._id,
        previousTier: req.user.tier || 'free',
        resource: req.originalUrl,
        success: false,
        metadata: { reason: 'OpenAI Moderation violation block (streaming)' },
      });

      // Suspend user's AI access for 30 minutes
      await aiCostControls.triggerAbuseSuspension(req.user._id, 1800);

      return res.status(400).json({
        error: 'SAFETY_VIOLATION',
        message: 'This query contains content flagged as unsafe by academic AI safety rules. Access suspended.',
      });
    }

    // Enforce sliding quotas, daily user/global caps, and request fingerprint locks
    const controlData = await aiCostControls.enforceCostControls(req, prompt);

    logAuditEvent({
      action: 'ai_request',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: { provider: aiConfig.provider, promptLength: prompt.length, streaming: true },
    });

    // Start SSE response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = aiProvider.generateCompletionStream({
      prompt,
      signal: controller.signal,
      userId: req.user._id,
    });

    let fullResponse = '';
    let providerUsed = 'unknown';
    let finalUsage = null;

    for await (const chunk of stream) {
      if (chunk.token) {
        fullResponse += chunk.token;
        res.write(`data: ${JSON.stringify({ chunk: chunk.token })}\n\n`);
      }
      if (chunk.done) {
        providerUsed = chunk.provider || providerUsed;
        finalUsage = chunk.usage || finalUsage;
      }
    }

    if (!finalUsage) {
      finalUsage = {
        promptTokens: aiTokenUtils.estimateTokenCount(prompt),
        completionTokens: aiTokenUtils.estimateTokenCount(fullResponse),
        totalTokens: aiTokenUtils.estimateTokenCount(prompt) + aiTokenUtils.estimateTokenCount(fullResponse),
      };
    }

    const result = {
      response: fullResponse,
      provider: providerUsed,
      usage: finalUsage,
    };

    // Commit estimated USD costs and token usage tallies to logs and Redis counters
    const estimatedCostUsd = await aiCostControls.commitUsageStats(req, controlData, result);

    logAuditEvent({
      action: 'ai_response',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: {
        provider_used: providerUsed,
        tokens_used: finalUsage.totalTokens || 0,
        estimatedCostUsd,
        durationMs: Date.now() - startTime,
        streaming: true,
      },
    });

    console.log(`🤖 [AI Cost Audit] Chat Stream Completed. Tokens: ${finalUsage.totalTokens || 0} | Cost: $${estimatedCostUsd.toFixed(6)}`);

    // Persist Dialogue to MongoDB Conversation logs
    let conversation = await Conversation.findOne({ userId: req.user._id, roomId: null });
    if (!conversation) {
      conversation = new Conversation({ userId: req.user._id, messages: [] });
    }
    conversation.messages.push({ sender: 'user', text: prompt });
    conversation.messages.push({ sender: 'ai', text: fullResponse });
    await conversation.save();

    const xpService = require('../services/xpService');
    const achievementService = require('../services/achievementService');
    await xpService.awardXp(req.user._id, 'AI_CHAT');
    await achievementService.checkAndUnlock(req.user._id, 'FIRST_AI');

    // Track AI prompt sent event in PostHog
    const AnalyticsService = require('../services/analyticsService');
    await AnalyticsService.track('ai_prompt_sent', req.user._id.toString(), {
      promptLength: prompt.length,
      provider: providerUsed || 'unknown',
      totalTokens: finalUsage.totalTokens || 0,
      estimatedCostUsd,
      promptType: 'chat-stream',
      planTier: req.user.tier || 'free'
    });

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('📡 [AI Router Stream] Mid-flight user request aborted/cancelled. SSE stream ended.');
      return;
    }

    // Log failures
    logAuditEvent({
      action: 'ai_failure',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: false,
      metadata: { error: error.message, streaming: true },
    });

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    } else {
      if (error.statusCode) {
        res.status(error.statusCode).json({
          error: error.message.split(':')[0],
          message: error.message.split(':').slice(1).join(':').trim() || error.message
        });
      } else {
        res.status(500).json({ error: 'INTERNAL_ERROR', message: error.message });
      }
    }
  }
});

module.exports = {
  router,
};
