#!/usr/bin/env node
// scripts/aiPhase1Tests.js
// Minimal Phase 1 validation harness for AI caching and token trimming.

const assert = require('assert');
const aiTokenUtils = require('../src/utils/aiTokenUtils');
const aiCache = require('../src/services/aiCache');
const aiMetrics = require('../src/metrics/aiMetrics');
const aiProvider = require('../src/services/aiProvider');
const openaiAdapter = require('../src/services/providers/openaiAdapter');
const { createRedisClient } = require('../src/config/redisClient');

async function testTokenTrimmingPreservesLatest() {
  const systemPrompt = 'System: keep this intact.';
  const prompt = [
    'old context line one',
    'old context line two',
    'Please answer the latest question accurately.',
  ].join('\n');

  const trimmed = aiTokenUtils.trimPromptToBudget({
    systemPrompt,
    prompt,
    maxPromptTokens: 8,
  });

  assert(trimmed.includes('Please answer the latest question accurately.'), 'Latest user message must be preserved.');
  console.log('✅ Token trimming preserves latest message.');
}

async function testRedisFallback() {
  const savedEnv = {
    REDIS_URL: process.env.REDIS_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_MODE: process.env.REDIS_MODE,
  };
  delete process.env.REDIS_URL;
  delete process.env.REDIS_HOST;
  delete process.env.REDIS_PORT;
  delete process.env.REDIS_MODE;

  const result = await aiCache.getCachedCompletion({
    provider: 'mock',
    model: 'gpt-4o-mini',
    systemPrompt: 'sys',
    prompt: 'ping',
  });

  assert.strictEqual(result, null, 'Redis outage fallback should return null without throwing.');
  console.log('✅ Redis outage fallback does not throw and returns null.');

  Object.assign(process.env, savedEnv);
}

async function testProviderFailover() {
  const original = openaiAdapter.requestOpenAICompletion;
  openaiAdapter.requestOpenAICompletion = async () => {
    throw new Error('Simulated OpenAI outage');
  };

  try {
    const result = await aiProvider.generateCompletion({
      prompt: 'What is the study summary?',
      providerOverride: 'openai',
    });

    assert.strictEqual(result.provider, 'mock-fallback');
    assert.ok(result.response.includes('Academic Tutor is operating'), 'Fallback response should be returned on OpenAI failure.');
    console.log('✅ OpenAI provider failover returns mock fallback.');
  } finally {
    openaiAdapter.requestOpenAICompletion = original;
  }
}

async function testMetricsSnapshot() {
  const hitsBefore = aiMetrics.getCacheHits();
  const missesBefore = aiMetrics.getCacheMisses();

  aiMetrics.recordCacheHit();
  aiMetrics.recordCacheMiss();

  const hitsAfter = aiMetrics.getCacheHits();
  const missesAfter = aiMetrics.getCacheMisses();
  const ratio = aiMetrics.getCacheHitRatio();

  assert.strictEqual(hitsAfter, hitsBefore + 1, 'Cache hit counter should increment.');
  assert.strictEqual(missesAfter, missesBefore + 1, 'Cache miss counter should increment.');
  assert.ok(ratio >= 0 && ratio <= 1, 'Cache hit ratio should be between 0 and 1.');
  console.log('✅ AI metrics snapshot counters behave correctly.');
}

async function testCacheConsistency() {
  let client;
  const savedRedisEnv = {
    REDIS_MODE: process.env.REDIS_MODE,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT,
    REDIS_URL: process.env.REDIS_URL,
  };

  ['REDIS_MODE', 'REDIS_HOST', 'REDIS_PORT', 'REDIS_URL'].forEach((key) => {
    if (process.env[key] === 'undefined') {
      delete process.env[key];
    }
  });

  try {
    client = createRedisClient({ maxRetriesPerRequest: 1 });
    await client.ping();
  } catch (error) {
    console.log('⚠️ Redis not available for cache consistency test. Skipping testCacheConsistency.');
    if (client) await client.disconnect();
    Object.assign(process.env, savedRedisEnv);
    return;
  }

  try {
    const payload = {
      provider: 'mock',
      model: 'gpt-4o-mini',
      systemPrompt: 'system',
      prompt: 'test cache payload',
      value: {
        response: 'cached response',
        provider: 'mock',
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        timestamp: new Date().toISOString(),
      },
    };

    await aiCache.setCachedCompletion(payload);
    const item = await aiCache.getCachedCompletion(payload);
    assert.ok(item, 'Cached value should be retrieved when Redis is available.');
    assert.strictEqual(item.response, 'cached response');
    console.log('✅ Cache consistency test passed with Redis available.');
  } finally {
    await client.disconnect();
    Object.assign(process.env, savedRedisEnv);
  }
}

(async () => {
  try {
    await testTokenTrimmingPreservesLatest();
    await testRedisFallback();
    await testProviderFailover();
    await testMetricsSnapshot();
    await testCacheConsistency();
    console.log('🎉 Phase 1 AI infrastructure tests passed.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Phase 1 AI infrastructure test failure:', error);
    process.exit(1);
  }
})();
