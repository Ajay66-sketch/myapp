// src/services/aiCache.js
// Redis-backed deterministic exact cache and embedding-based semantic cache with sliding-window pruning.

const crypto = require('crypto');
const { getRedisClient } = require('../config/redisClient');
const aiConfig = require('../config/ai');
const aiMetrics = require('../metrics/aiMetrics');
const systemEventBus = require('../telemetry/eventBus');

function _getClient() {
  try {
    const client = getRedisClient();
    if (client && client.status === 'ready') return client;
    return null;
  } catch (err) {
    return null;
  }
}

function computeSha256(text) {
  const clean = String(text || '').trim();
  return crypto.createHash('sha256').update(clean).digest('hex');
}

async function computeCacheKey({ provider, model, systemPrompt, prompt }) {
  const normalized = `${provider}|${model}|${systemPrompt || ''}|${prompt || ''}`;
  const hashHex = computeSha256(normalized);
  return `ai:cache:${hashHex}`;
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

/**
 * Computes Cosine Similarity between two floating-point vector arrays
 */
function calculateCosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getCachedCompletion({ provider, model, systemPrompt, prompt, userId = null }) {
  const client = _getClient();
  if (!client) {
    aiMetrics.recordCacheMiss();
    return null;
  }

  try {
    // 1. First attempt: Exact-match cache lookup (High-Speed O(1))
    const key = await computeCacheKey({ provider, model, systemPrompt, prompt });
    const payload = await client.get(key);

    if (payload) {
      const parsed = expandCachePayload(payload);
      if (parsed) {
        aiMetrics.recordCacheHit();
        
        // Emit exact cache hit telemetry
        systemEventBus.emit('ai_cache_hit', 'info', {
          type: 'exact',
          prompt,
          provider,
          model,
        }, userId);

        const AnalyticsService = require('./analyticsService');
        AnalyticsService.track('ai_cache_hit', userId || 'anonymous', {
          cacheType: 'exact',
          promptLength: prompt.length,
        }).catch(() => {});

        return parsed;
      } else {
        await client.del(key);
      }
    }

    // 2. Second attempt: Semantic-match cache lookup using embeddings
    const embeddingService = require('./embeddingService');
    const queryEmbedding = await embeddingService.getEmbedding(prompt);

    // Retrieve active sliding window list keys
    const listKey = 'ai:semantic:keys';
    const cachedHashes = await client.lrange(listKey, 0, -1);

    if (cachedHashes && cachedHashes.length > 0) {
      const threshold = aiConfig.semanticCache?.threshold || 0.90;
      
      for (const hash of cachedHashes) {
        const itemKey = `ai:semantic:cache:${hash}`;
        const itemData = await client.get(itemKey);
        if (!itemData) continue;

        try {
          const entry = JSON.parse(itemData);
          const similarity = calculateCosineSimilarity(queryEmbedding, entry.embedding);

          if (similarity >= threshold) {
            aiMetrics.recordCacheHit();

            // Emit semantic cache hit telemetry
            systemEventBus.emit('ai_cache_hit', 'info', {
              type: 'semantic',
              similarity: parseFloat(similarity.toFixed(4)),
              prompt,
              matchedPrompt: entry.prompt,
              provider: entry.value?.provider,
            }, userId);

            const AnalyticsService = require('./analyticsService');
            AnalyticsService.track('ai_cache_hit', userId || 'anonymous', {
              cacheType: 'semantic',
              similarity: parseFloat(similarity.toFixed(4)),
              promptLength: prompt.length,
            }).catch(() => {});

            return entry.value;
          }
        } catch (e) {
          // Skip corrupted entries
        }
      }
    }

    aiMetrics.recordCacheMiss();
    return null;
  } catch (error) {
    aiMetrics.recordCacheMiss();
    return null;
  }
}

async function setCachedCompletion({ provider, model, systemPrompt, prompt, value, ttlSeconds = aiConfig.cacheTtlSeconds, userId = null }) {
  const client = _getClient();
  if (!client || !value) {
    return null;
  }

  try {
    // 1. Save Exact Cache
    const key = await computeCacheKey({ provider, model, systemPrompt, prompt });
    const payload = compactCachePayload(value);
    await client.set(key, payload, 'EX', ttlSeconds);

    // 2. Save Semantic Cache
    const embeddingService = require('./embeddingService');
    const embedding = await embeddingService.getEmbedding(prompt);
    
    const hash = computeSha256(prompt);
    const semanticKey = `ai:semantic:cache:${hash}`;
    const semanticPayload = {
      prompt,
      embedding,
      value,
    };

    await client.set(semanticKey, JSON.stringify(semanticPayload), 'EX', Math.max(ttlSeconds, 86400));

    // Maintain sliding window list size without duplicates
    const listKey = 'ai:semantic:keys';
    await client.lrem(listKey, 0, hash);
    await client.lpush(listKey, hash);
    await client.ltrim(listKey, 0, (aiConfig.semanticCache?.maxKeys || 100) - 1);

    return true;
  } catch (error) {
    return null;
  }
}

module.exports = {
  getCachedCompletion,
  setCachedCompletion,
};
