// src/services/aiProvider.js
// Production-grade AI Routing and Caching Layer with sequential failover and real-time SSE streaming.

const aiConfig = require('../config/ai');
const aiCache = require('./aiCache');
const aiMetrics = require('../metrics/aiMetrics');
const aiTokenUtils = require('../utils/aiTokenUtils');
const systemEventBus = require('../telemetry/eventBus');
const AnalyticsService = require('./analyticsService');

const prometheus = require('../metrics/prometheus');
const circuitBreaker = require('../core/circuitBreaker');

// Load provider adapters
const openaiAdapter = require('./providers/openaiAdapter');
const geminiAdapter = require('./providers/geminiAdapter');
const anthropicAdapter = require('./providers/anthropicAdapter');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Classifies a prompt payload into lightweight (GPT-4o-mini) or complex (Claude Sonnet)
 */
function classifyPrompt(prompt) {
  const clean = String(prompt || '').trim().toLowerCase();
  
  // Math indicators: LaTeX markers, formulas, and advanced academic terms
  const mathRegex = /(\\\(|\\\[|\$\$|\$|\\frac|\\sqrt|\\sum|\\int|\b(solve|equation|derivative|integral|theorem|calculus|algebra|geometry|matrix|probability|statistics|proof|math)\b)/i;
  
  // Code indicators: Markdown code blocks, brackets, programming language declarations, and script keywords
  const codeRegex = /(```|\b(const|let|function|def|class|import|from|return|console\.log|public\s+static|system\.out|html|css|javascript|typescript|python|golang|rust)\b|[{}()[\];])/i;
  
  if (mathRegex.test(clean) || codeRegex.test(clean)) {
    return 'complex';
  }
  
  return 'lightweight';
}

function generateMockResponse(prompt) {
  const normalized = prompt.toLowerCase();

  if (normalized.includes('summar') || normalized.includes('context')) {
    const nameMatch = prompt.match(/Room Name:\s*([^\n\r]+)/i);
    const roomName = nameMatch ? nameMatch[1].trim() : 'Focus lounge';

    const hasLogs = normalized.includes('username:');
    let activitySummary = 'There is currently no chat logs recorded in this study room.';

    if (hasLogs) {
      activitySummary = 'Based on the chronological logs, peers are sharing study goals, coordinating Pomodoro timer blocks, and keeping each other accountable.';
    }

    return `Here is a summary of the focus room "${roomName}":\nThe room currently has active members registered. ${activitySummary}\n\nDirectives:\n- Maintain active collaboration.\n- Utilize Pomodoro timers to optimize cognitive focus.`;
  }

  if (normalized.includes('study') || normalized.includes('pomodoro') || normalized.includes('timer')) {
    return 'The Pomodoro technique splits work into 25-minute focus intervals separated by 5-minute cognitive resets. This maintains high dopamine cycles and blocks creative burnout.';
  }

  return 'Hello! I am Antigravity AI, your dedicated SaaS focus assistant. I can help summarize study room chat histories, analyze peer productivity, or answer academic topics. Let me know what you are studying today!';
}

function buildDefaultResult(response, provider, usage) {
  return {
    response,
    provider,
    usage: {
      promptTokens: usage?.promptTokens || 0,
      completionTokens: usage?.completionTokens || 0,
      totalTokens: usage?.totalTokens || 0,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Standard retry helper with exponential backoff for stream fetches
 */
async function executeWithRetry(fn, retries = aiConfig.retryCounts, delay = 1000) {
  try {
    return await fn();
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    if (retries > 0) {
      await sleep(delay);
      return executeWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

/**
 * Audit and execute completion generation with automatic dynamic routing and sequential failover.
 */
async function generateCompletion({ prompt, systemPrompt = aiConfig.systemInstructions, providerOverride, signal = null, userId = null }) {
  const activeProvider = providerOverride || aiConfig.provider;
  const modelName = activeProvider === 'local' ? aiConfig.local.model : aiConfig.openai.model;
  const trimmedPrompt = aiTokenUtils.trimPromptToBudget({
    systemPrompt,
    prompt,
    maxPromptTokens: aiConfig.promptTokenBudget,
  });

  // 1. Check exact/semantic Redis Cache
  const cached = await aiCache.getCachedCompletion({
    provider: activeProvider,
    model: modelName,
    systemPrompt,
    prompt: trimmedPrompt,
    userId,
  });

  if (cached) {
    return cached;
  }

  // If mock mode is explicitly chosen, resolve immediately
  if (activeProvider === 'mock') {
    const textResponse = generateMockResponse(trimmedPrompt);
    const result = buildDefaultResult(textResponse, 'mock', {
      promptTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt),
      completionTokens: aiTokenUtils.estimateTokenCount(textResponse),
      totalTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt) + aiTokenUtils.estimateTokenCount(textResponse),
    });
    await aiCache.setCachedCompletion({
      provider: 'mock',
      model: modelName,
      systemPrompt,
      prompt: trimmedPrompt,
      value: result,
      userId,
    });
    return result;
  }

  // 2. Dynamic Classifier Routing
  const classification = classifyPrompt(trimmedPrompt);
  const primaryProvider = providerOverride || (classification === 'complex' ? 'anthropic' : 'openai');

  // 3. Sequential Failover Pipeline: Routed -> Failover Chain List
  const mainChain = aiConfig.failoverChain || ['openai', 'gemini', 'anthropic'];
  const providersToTry = [primaryProvider, ...mainChain.filter((p) => p !== primaryProvider)];

  let lastError = null;

  for (let i = 0; i < providersToTry.length; i++) {
    const provider = providersToTry[i];
    const providerModel = provider === 'anthropic' ? aiConfig.anthropic.model :
                          provider === 'gemini' ? aiConfig.gemini.model :
                          aiConfig.openai.model;

    // Skip if API key is not configured for this provider in production
    const isConfigured = provider === 'anthropic' ? aiConfig.anthropic.apiKey :
                          provider === 'gemini' ? aiConfig.gemini.apiKey :
                          aiConfig.openai.apiKey;

    if (!isConfigured) {
      continue;
    }

    try {
      const providerStart = Date.now();
      
      // Emit Telemetry event - Selected
      systemEventBus.emit('ai_provider_selected', 'info', {
        provider,
        model: providerModel,
        promptLength: trimmedPrompt.length,
        classification,
        failoverIndex: i,
      }, userId);

      const AnalyticsService = require('./analyticsService');
      AnalyticsService.track('ai_provider_selected', userId || 'anonymous', {
        provider,
        model: providerModel,
        classification,
      }).catch(() => {});

      const breaker = circuitBreaker.getBreaker(provider, {
        failureThreshold: 3,
        cooldownPeriod: 30000,
      });

      let completion;
      try {
        completion = await breaker.execute(async () => {
          if (provider === 'openai') {
            return openaiAdapter.requestOpenAICompletion({ systemPrompt, prompt: trimmedPrompt, maxTokens: aiConfig.maxTokens, signal });
          } else if (provider === 'gemini') {
            return geminiAdapter.requestGeminiCompletion({ systemPrompt, prompt: trimmedPrompt, maxTokens: aiConfig.maxTokens, signal });
          } else if (provider === 'anthropic') {
            return anthropicAdapter.requestAnthropicCompletion({ systemPrompt, prompt: trimmedPrompt, maxTokens: aiConfig.maxTokens, signal });
          }
          throw new Error(`Unknown provider: ${provider}`);
        });
        
        prometheus.aiProviderRequestsTotal.inc({ provider, model: providerModel, status: 'success' });
      } catch (breakerErr) {
        prometheus.aiProviderRequestsTotal.inc({ provider, model: providerModel, status: 'failure' });
        throw breakerErr;
      }

      const durationMs = Date.now() - providerStart;
      aiMetrics.recordProviderLatency(provider, durationMs);
      prometheus.aiProviderLatency.observe({ provider, model: providerModel }, durationMs / 1000);

      const result = buildDefaultResult(completion.response, provider, completion.usage);
      
      // Save successfully resolved result to the exact/semantic Cache
      await aiCache.setCachedCompletion({
        provider,
        model: providerModel,
        systemPrompt,
        prompt: trimmedPrompt,
        value: result,
        userId,
      });

      return result;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }
      
      console.warn(`[AI Failover Pipeline] Provider ${provider} failed:`, error.message);
      lastError = error;

      // Determine next provider in the chain for warning telemetry
      const nextProvider = providersToTry[i + 1] || 'mock-fallback';
      
      // Emit Telemetry event - Fallback Triggered
      systemEventBus.emit('ai_fallback_triggered', 'warn', {
        failedProvider: provider,
        failedModel: providerModel,
        fallbackProvider: nextProvider,
        error: error.message,
      }, userId);

      AnalyticsService.track('ai_fallback_triggered', userId || 'anonymous', {
        failedProvider: provider,
        fallbackProvider: nextProvider,
        errorMessage: error.message,
      }).catch(() => {});
    }
  }

  // 4. Local Recovery Mode Fallback (If all providers failed or were unconfigured)
  console.warn('[AI Failover Pipeline] All providers failed or were unconfigured. Using high-performance recovery mock.');
  const textResponse = generateMockResponse(trimmedPrompt) + '\n\n*(Academic Tutor is operating in high-performance local offline recovery mode)*';
  const result = buildDefaultResult(textResponse, 'mock-fallback', {
    promptTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt),
    completionTokens: aiTokenUtils.estimateTokenCount(textResponse),
    totalTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt) + aiTokenUtils.estimateTokenCount(textResponse),
  });
  return result;
}

/**
 * Dynamic, sequential failover-aware SSE Stream Generator.
 * Yields parsed token chunks natively: { token: string, done: boolean, provider: string, usage?: object }
 */
async function* generateCompletionStream({ prompt, systemPrompt = aiConfig.systemInstructions, providerOverride, signal = null, userId = null }) {
  const activeProvider = providerOverride || aiConfig.provider;
  const modelName = activeProvider === 'local' ? aiConfig.local.model : aiConfig.openai.model;
  const trimmedPrompt = aiTokenUtils.trimPromptToBudget({
    systemPrompt,
    prompt,
    maxPromptTokens: aiConfig.promptTokenBudget,
  });

  // 1. Check Cache first (Exact or Semantic)
  const cached = await aiCache.getCachedCompletion({
    provider: activeProvider,
    model: modelName,
    systemPrompt,
    prompt: trimmedPrompt,
    userId,
  });

  if (cached) {
    // Exact/Semantic Cache Hit Playback Simulator: Yields cached words sequentially
    const text = cached.response || '';
    const words = text.split(/(\s+)/); // Keep spacing intact
    let tokensWritten = 0;
    
    for (const word of words) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      yield {
        token: word,
        done: false,
        provider: `${cached.provider}-cached`,
        usage: cached.usage,
      };
      tokensWritten += aiTokenUtils.estimateTokenCount(word);
      // Adaptive rate pacing: 15ms per chunk
      await sleep(15);
    }
    yield { token: '', done: true, provider: `${cached.provider}-cached`, usage: cached.usage };
    return;
  }

  // If mock mode is explicitly chosen
  if (activeProvider === 'mock') {
    const textResponse = generateMockResponse(trimmedPrompt);
    const mockUsage = {
      promptTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt),
      completionTokens: aiTokenUtils.estimateTokenCount(textResponse),
      totalTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt) + aiTokenUtils.estimateTokenCount(textResponse),
    };
    
    const words = textResponse.split(/(\s+)/);
    for (const word of words) {
      yield { token: word, done: false, provider: 'mock', usage: mockUsage };
      await sleep(15);
    }
    yield { token: '', done: true, provider: 'mock', usage: mockUsage };
    return;
  }

  // 2. Dynamic Classification
  const classification = classifyPrompt(trimmedPrompt);
  const primaryProvider = providerOverride || (classification === 'complex' ? 'anthropic' : 'openai');

  // 3. Sequential Failover Streaming Pipeline
  const mainChain = aiConfig.failoverChain || ['openai', 'gemini', 'anthropic'];
  const providersToTry = [primaryProvider, ...mainChain.filter((p) => p !== primaryProvider)];

  for (let i = 0; i < providersToTry.length; i++) {
    const provider = providersToTry[i];
    const providerModel = provider === 'anthropic' ? aiConfig.anthropic.model :
                          provider === 'gemini' ? aiConfig.gemini.model :
                          aiConfig.openai.model;

    const isConfigured = provider === 'anthropic' ? aiConfig.anthropic.apiKey :
                          provider === 'gemini' ? aiConfig.gemini.apiKey :
                          aiConfig.openai.apiKey;

    if (!isConfigured) {
      continue;
    }

    try {
      // Emit routing selection telemetry
      systemEventBus.emit('ai_provider_selected', 'info', {
        provider,
        model: providerModel,
        promptLength: trimmedPrompt.length,
        classification,
        streaming: true,
        failoverIndex: i,
      }, userId);

      const AnalyticsService = require('./analyticsService');
      AnalyticsService.track('ai_provider_selected', userId || 'anonymous', {
        provider,
        model: providerModel,
        classification,
        streaming: true,
      }).catch(() => {});

      const breaker = circuitBreaker.getBreaker(provider, {
        failureThreshold: 3,
        cooldownPeriod: 30000,
      });

      if (breaker.state === 'OPEN') {
        const elapsed = Date.now() - breaker.lastFailureTime;
        if (elapsed > breaker.cooldownPeriod) {
          breaker.state = 'HALF_OPEN';
          systemEventBus.emit('circuit:half_open', 'warn', { service: breaker.name });
        } else {
          throw new Error(`Circuit breaker [${provider}] is OPEN`);
        }
      }

      let streamGenerator;
      try {
        streamGenerator = await breaker.execute(async () => {
          if (provider === 'openai') {
            return requestOpenAICompletionStream({ systemPrompt, prompt: trimmedPrompt, maxTokens: aiConfig.maxTokens, signal });
          } else if (provider === 'gemini') {
            return requestGeminiCompletionStream({ systemPrompt, prompt: trimmedPrompt, maxTokens: aiConfig.maxTokens, signal });
          } else if (provider === 'anthropic') {
            return requestAnthropicCompletionStream({ systemPrompt, prompt: trimmedPrompt, maxTokens: aiConfig.maxTokens, signal });
          }
          throw new Error(`Unknown provider: ${provider}`);
        });
      } catch (err) {
        prometheus.aiProviderRequestsTotal.inc({ provider, model: providerModel, status: 'failure' });
        throw err;
      }

      let fullResponse = '';
      try {
        for await (const chunk of streamGenerator) {
          if (chunk.token) {
            fullResponse += chunk.token;
            yield { token: chunk.token, done: false, provider };
          }
        }
        
        if (breaker.state === 'HALF_OPEN') {
          breaker.state = 'CLOSED';
          breaker.failures = 0;
          systemEventBus.emit('circuit:closed', 'info', { service: breaker.name });
        }
        prometheus.aiProviderRequestsTotal.inc({ provider, model: providerModel, status: 'success' });
      } catch (streamErr) {
        breaker.failures++;
        breaker.lastFailureTime = Date.now();
        systemEventBus.emit('circuit:failure', 'warn', {
          service: breaker.name,
          error: streamErr.message,
          failures: breaker.failures
        });
        
        if (breaker.state === 'CLOSED' && breaker.failures >= breaker.failureThreshold) {
          breaker.state = 'OPEN';
          systemEventBus.emit('circuit:open', 'error', { service: breaker.name, threshold: breaker.failureThreshold });
        } else if (breaker.state === 'HALF_OPEN') {
          breaker.state = 'OPEN';
          systemEventBus.emit('circuit:open', 'error', { service: breaker.name, message: 'Failed during half-open trial' });
        }
        
        prometheus.aiProviderRequestsTotal.inc({ provider, model: providerModel, status: 'failure' });
        throw streamErr;
      }

      // Commit to cache upon stream successful completion
      const estimatedUsage = {
        promptTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt),
        completionTokens: aiTokenUtils.estimateTokenCount(fullResponse),
        totalTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt) + aiTokenUtils.estimateTokenCount(fullResponse),
      };

      const result = buildDefaultResult(fullResponse, provider, estimatedUsage);
      await aiCache.setCachedCompletion({
        provider,
        model: providerModel,
        systemPrompt,
        prompt: trimmedPrompt,
        value: result,
        userId,
      });

      yield { token: '', done: true, provider, usage: estimatedUsage };
      return;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }

      console.warn(`[AI Failover Stream] Provider ${provider} streaming failed:`, error.message);
      const nextProvider = providersToTry[i + 1] || 'mock-fallback';

      systemEventBus.emit('ai_fallback_triggered', 'warn', {
        failedProvider: provider,
        failedModel: providerModel,
        fallbackProvider: nextProvider,
        streaming: true,
        error: error.message,
      }, userId);

      AnalyticsService.track('ai_fallback_triggered', userId || 'anonymous', {
        failedProvider: provider,
        fallbackProvider: nextProvider,
        streaming: true,
        errorMessage: error.message,
      }).catch(() => {});
    }
  }

  // 4. Offline Recovery Fallback Playback
  console.warn('[AI Failover Stream] All streaming providers failed/unconfigured. Emulating mock fallback.');
  const textResponse = generateMockResponse(trimmedPrompt) + '\n\n*(Academic Tutor is operating in high-performance local offline recovery mode)*';
  const mockUsage = {
    promptTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt),
    completionTokens: aiTokenUtils.estimateTokenCount(textResponse),
    totalTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt) + aiTokenUtils.estimateTokenCount(textResponse),
  };

  const words = textResponse.split(/(\s+)/);
  for (const word of words) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    yield { token: word, done: false, provider: 'mock-fallback', usage: mockUsage };
    await sleep(15);
  }
  yield { token: '', done: true, provider: 'mock-fallback', usage: mockUsage };
}

// Map adapters dynamically for generator resolution
const { requestOpenAICompletionStream } = openaiAdapter;
const { requestGeminiCompletionStream } = geminiAdapter;
const { requestAnthropicCompletionStream } = anthropicAdapter;

module.exports = {
  generateCompletion,
  generateCompletionStream,
  classifyPrompt,
};
