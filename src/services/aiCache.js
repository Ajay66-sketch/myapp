// src/services/aiCache.js
// Redis-backed deterministic AI prompt cache with TTL and telemetry.

const crypto = require('crypto');
const { getRedisClient } = require('../config/redisClient');
const aiConfig = require('../config/ai');
const aiMetrics = require('../metrics/aiMetrics');

function _getClient() {
  try {
    const client = getRedisClient();
    if (client && client.status === 'ready') return client;
    return null;
  } catch (err) {
    return null;
  }
}

async function computeCacheKey({ provider, model, systemPrompt, prompt }) {
  const normalized = `${provider}|${model}|${systemPrompt || ''}|${prompt || ''}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);

  if (crypto.webcrypto && crypto.webcrypto.subtle) {
    const hashBuffer = await crypto.webcrypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return `ai:cache:${hashHex}`;
  }

  const fallbackHash = crypto.createHash('sha256').update(normalized).digest('hex');
  return `ai:cache:${fallbackHash}`;
}

function compactCachePayload(value) {
  return JSON.stringify({
    r: value.response,
    p: value.provider,
    u: {
      a: value.usage?.promptTokens || 0,
      b: value.usage?.completionTokens || 0,
      c: value.usage?.totalTokens || 0,
    },
    t: value.timestamp || new Date().toISOString(),
  });
}

function expandCachePayload(payload) {
  if (!payload) return null;
  try {
    const parsed = JSON.parse(payload);
    return {
      response: parsed.r,
      provider: parsed.p,
      usage: {
        promptTokens: parsed.u?.a || 0,
        completionTokens: parsed.u?.b || 0,
        totalTokens: parsed.u?.c || 0,
      },
      timestamp: parsed.t,
    };
  } catch (error) {
    return null;
  }
}

async function getCachedCompletion({ provider, model, systemPrompt, prompt }) {
  const client = _getClient();
  if (!client) {
    aiMetrics.recordCacheMiss();
    return null;
  }

  try {
    const key = await computeCacheKey({ provider, model, systemPrompt, prompt });
    const payload = await client.get(key);

    if (!payload) {
      aiMetrics.recordCacheMiss();
      return null;
    }

    const parsed = expandCachePayload(payload);
    if (!parsed) {
      await client.del(key);
      aiMetrics.recordCacheMiss();
      return null;
    }

    aiMetrics.recordCacheHit();
    return parsed;
  } catch (error) {
    aiMetrics.recordCacheMiss();
    return null;
  }
}

async function setCachedCompletion({ provider, model, systemPrompt, prompt, value, ttlSeconds = aiConfig.cacheTtlSeconds }) {
  const client = _getClient();
  if (!client || !value) {
    return null;
  }

  try {
    const key = await computeCacheKey({ provider, model, systemPrompt, prompt });
    const payload = compactCachePayload(value);
    await client.set(key, payload, 'EX', ttlSeconds);
    return true;
  } catch (error) {
    return null;
  }
}

module.exports = {
  getCachedCompletion,
  setCachedCompletion,
};
