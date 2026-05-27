// src/utils/aiCostControls.js
// SRE-grade AI Cost Optimization & Abuse Prevention Engine
// Implements token quotas, request fingerprinting, global budget caps, and emergency fallbacks.

const crypto = require('crypto');
const { getRedisClient } = require('../config/redisClient');
const AiUsageLog = require('../models/AiUsageLog');
const AiBudgetConfig = require('../models/AiBudgetConfig');
const systemEventBus = require('../telemetry/eventBus');

// ─── 1. Est. Cost Constants (USD per token) ──────────────────────────────────
const MODEL_PRICING = {
  'gpt-4o-mini': { input: 0.00000015, output: 0.00000060 },
  'gpt-4o': { input: 0.0000025, output: 0.0000100 },
  'llama3': { input: 0.0, output: 0.0 },
  'mock': { input: 0.0, output: 0.0 }
};

/**
 * Calculates USD cost for LLM completion requests based on model token weights.
 */
function calculateRequestCost(model, promptTokens, completionTokens) {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
  const inputCost = promptTokens * pricing.input;
  const outputCost = completionTokens * pricing.output;
  return inputCost + outputCost;
}

/**
 * Generates a high-speed SHA-256 fingerprint hash of a request payload.
 */
function generateRequestFingerprint(userId, prompt) {
  const cleanPrompt = String(prompt).trim().toLowerCase();
  return crypto
    .createHash('sha256')
    .update(`${userId}:${cleanPrompt}`)
    .digest('hex');
}

/**
 * Audit and enforce SRE-grade token budgets, emergency caps, and abuse rules.
 */
async function enforceCostControls(req, promptText) {
  const redis = getRedisClient();
  const userId = req.user._id.toString();
  const isRedisReady = redis && redis.status === 'ready';

  // ─── 2. Request Fingerprinting & Duplicate Replays ─────────────────────────
  const fingerprint = generateRequestFingerprint(userId, promptText);
  if (isRedisReady) {
    const lockKey = `ai:fingerprint:${fingerprint}`;
    const acquired = await redis.set(lockKey, 'locked', 'NX', 'EX', 3); // 3 seconds replay gate
    if (!acquired) {
      const err = new Error('BOT_STORM_DETECTION: Duplicate prompt received too quickly. Throttled.');
      err.statusCode = 429;
      throw err;
    }
  }

  // ─── 3. Abuse Suspension Checks ─────────────────────────────────────────────
  if (isRedisReady) {
    const cooldownKey = `ai:cooldown:user:${userId}`;
    const suspended = await redis.get(cooldownKey);
    if (suspended) {
      const err = new Error('ABUSE_SUSPENSION: AI access temporarily suspended due to repeated safety or rate violations.');
      err.statusCode = 403;
      throw err;
    }
  }

  // ─── 4. Query Persistent Global Budget Configurations ──────────────────────
  let budgetConfig = await AiBudgetConfig.findOne({});
  if (!budgetConfig) {
    budgetConfig = await AiBudgetConfig.create({});
  }

  // ─── 5. Hard Spending Cap / Emergency Shutdown ──────────────────────────────
  if (budgetConfig.emergencyShutdownActive) {
    const err = new Error('EMERGENCY_SHUTDOWN: AI features are temporarily in offline maintenance mode due to system budget limits.');
    err.statusCode = 503;
    throw err;
  }

  // ─── 6. Global Daily Budget Controls in Redis ──────────────────────────────
  const todayStr = new Date().toISOString().split('T')[0];
  const globalSpendKey = `ai:spend:global:day:${todayStr}`;
  
  if (isRedisReady) {
    const currentGlobalSpend = parseFloat(await redis.get(globalSpendKey) || '0');
    
    // Check if hard daily spending cap is breached
    if (currentGlobalSpend >= budgetConfig.globalDailyLimitUsd) {
      console.warn(`🚨 [AI Budget Alert] Global daily budget of $${budgetConfig.globalDailyLimitUsd} is EXHAUSTED! Enforcing fallback...`);
      systemEventBus.emit('budget:limit_breached', 'warn', { spend: currentGlobalSpend, limit: budgetConfig.globalDailyLimitUsd }, 'system');
      
      const err = new Error('EMERGENCY_BUDGET_CAP: Daily AI spending caps exceeded. Operation locked.');
      err.statusCode = 503;
      throw err;
    }
  }

  // ─── 7. User Token Quotas (High-Speed Sliding Window) ─────────────────────
  const userTokenKey = `ai:quota:user:${userId}:day:${todayStr}`;
  const userDailyLimits = {
    free: 5000,
    pro: 100000,
    premium: 100000,
    admin: 10000000,
  };
  const tier = String(req.user.tier || 'free').toLowerCase();
  const userDailyLimit = userDailyLimits[tier] || 5000;
  
  if (isRedisReady) {
    const currentUserTokens = parseInt(await redis.get(userTokenKey) || '0', 10);
    
    // Check 80% warning threshold and fire telemetry warning
    if (currentUserTokens >= userDailyLimit * 0.8) {
      systemEventBus.emit('ai_token_budget_warning', 'warn', {
        userId,
        tier: req.user.tier,
        tokensUsed: currentUserTokens,
        limit: userDailyLimit,
        percentUsed: parseFloat(((currentUserTokens / userDailyLimit) * 100).toFixed(2)),
      }, userId);

      const AnalyticsService = require('../services/analyticsService');
      AnalyticsService.track('ai_token_budget_warning', userId, {
        tier: req.user.tier,
        tokensUsed: currentUserTokens,
        limit: userDailyLimit,
      }).catch(() => {});
    }

    if (currentUserTokens >= userDailyLimit) {
      const err = new Error(`DAILY_QUOTA_EXCEEDED: You have exhausted your daily limit of ${userDailyLimit.toLocaleString()} study tokens. Resets in 24 hours.`);
      err.statusCode = 429;
      throw err;
    }
  }

  return { fingerprint, budgetConfig, todayStr, userTokenKey, globalSpendKey };
}

/**
 * Log and commit final estimated costs, token footprints, and budget meters.
 */
async function commitUsageStats(req, controlData, result) {
  const redis = getRedisClient();
  const userId = req.user._id;
  const isRedisReady = redis && redis.status === 'ready';

  const promptTokens = result.usage?.promptTokens || 0;
  const completionTokens = result.usage?.completionTokens || 0;
  const totalTokens = promptTokens + completionTokens;
  const model = result.provider === 'openai' ? 'gpt-4o-mini' : result.provider;
  const estimatedCost = calculateRequestCost(model, promptTokens, completionTokens);

  // 1. Persist to Auditing database logs
  await AiUsageLog.create({
    userId,
    promptFingerprint: controlData.fingerprint,
    modelUsed: model,
    promptTokens,
    completionTokens,
    totalTokens,
    estimatedCostUsd: estimatedCost,
    ipAddress: req.ip || '',
    userAgent: req.headers['user-agent'] || ''
  });

  // 2. Increment Redis token quotas (24h TTL)
  if (isRedisReady) {
    await redis.incrby(controlData.userTokenKey, totalTokens);
    await redis.expire(controlData.userTokenKey, 86400);

    // 3. Increment Redis global daily estimated spending meter
    await redis.incrbyfloat(controlData.globalSpendKey, estimatedCost);
    await redis.expire(controlData.globalSpendKey, 86400);

    // 4. Budget Alerting Threshold check
    const currentGlobalSpend = parseFloat(await redis.get(controlData.globalSpendKey) || '0');
    const thresholdSpend = controlData.budgetConfig.globalDailyLimitUsd * (controlData.budgetConfig.alertThresholdPercent / 100);
    
    if (currentGlobalSpend >= thresholdSpend) {
      console.warn(`⚠️ [AI Budget Warning] Global daily spending is at ${controlData.budgetConfig.alertThresholdPercent}% ($${currentGlobalSpend.toFixed(2)} / $${controlData.budgetConfig.globalDailyLimitUsd.toFixed(2)})`);
      systemEventBus.emit('budget:threshold_warning', 'info', { spend: currentGlobalSpend, threshold: thresholdSpend }, 'system');
      
      // Simulate Email/Webhook notification trigger
      sendBudgetWebhookAlert(currentGlobalSpend, controlData.budgetConfig.globalDailyLimitUsd);
    }
  }

  return estimatedCost;
}

/**
 * Handle safety-based abuse suspensions.
 */
async function triggerAbuseSuspension(userId, durationSeconds = 3600) {
  const redis = getRedisClient();
  if (redis && redis.status === 'ready') {
    const cooldownKey = `ai:cooldown:user:${userId}`;
    await redis.set(cooldownKey, 'suspended', 'EX', durationSeconds);
    console.error(`🚨 [AI Abuse Engine] User ${userId} suspended for ${durationSeconds}s due to malicious API activity.`);
    systemEventBus.emit('abuse:user_suspended', 'warn', { userId, durationSeconds }, 'system');
  }
}

/**
 * Mock dispatcher for Slack/Webhook/PagerDuty budget alert alerts.
 */
function sendBudgetWebhookAlert(spend, limit) {
  const webhookUrl = process.env.AI_BUDGET_WEBHOOK_URL;
  if (!webhookUrl) return;

  const payload = {
    text: `⚠️ *[SRE AI Cost Alert]* Global daily spending has reached threshold limits!\nCurrent Spend: \`$${spend.toFixed(4)}\` / Hard Limit: \`$${limit.toFixed(2)}\``,
    spend,
    limit,
    timestamp: new Date().toISOString()
  };

  fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(err => console.error('[AI Budget Webhook] Failed to dispatch webhook alert:', err.message));
}

module.exports = {
  calculateRequestCost,
  enforceCostControls,
  commitUsageStats,
  triggerAbuseSuspension
};
