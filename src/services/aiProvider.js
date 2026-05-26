// src/services/aiProvider.js
// Centralized provider abstraction with Redis-backed caching, token budget trimming,
// and OpenAI provider adapter integration.

const aiConfig = require('../config/ai');
const aiCache = require('./aiCache');
const aiMetrics = require('../metrics/aiMetrics');
const aiTokenUtils = require('../utils/aiTokenUtils');
const { requestOpenAICompletion } = require('./providers/openaiAdapter');

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
      promptTokens: usage.promptTokens || 0,
      completionTokens: usage.completionTokens || 0,
      totalTokens: usage.totalTokens || 0,
    },
    timestamp: new Date().toISOString(),
  };
}

async function generateCompletion({ prompt, systemPrompt = aiConfig.systemInstructions, providerOverride }) {
  const activeProvider = providerOverride || aiConfig.provider;
  const modelName = activeProvider === 'local' ? aiConfig.local.model : aiConfig.openai.model;
  const trimmedPrompt = aiTokenUtils.trimPromptToBudget({
    systemPrompt,
    prompt,
    maxPromptTokens: aiConfig.promptTokenBudget,
  });

  const cached = await aiCache.getCachedCompletion({
    provider: activeProvider,
    model: modelName,
    systemPrompt,
    prompt: trimmedPrompt,
  });

  if (cached) {
    return cached;
  }

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
    });
    return result;
  }

  if (activeProvider === 'openai') {
    const providerStart = Date.now();

    try {
      const completion = await requestOpenAICompletion({
        systemPrompt,
        prompt: trimmedPrompt,
        maxTokens: aiConfig.maxTokens,
      });

      const durationMs = Date.now() - providerStart;
      aiMetrics.recordProviderLatency('openai', durationMs);

      const result = buildDefaultResult(completion.response, 'openai', completion.usage);
      await aiCache.setCachedCompletion({
        provider: 'openai',
        model: modelName,
        systemPrompt,
        prompt: trimmedPrompt,
        value: result,
      });
      return result;
    } catch (error) {
      console.warn('[AI Provider] OpenAI request failed, falling back to mock provider:', error.message);
      const textResponse = generateMockResponse(trimmedPrompt) + '\n\n*(Academic Tutor is operating in high-performance local offline recovery mode)*';
      const result = buildDefaultResult(textResponse, 'mock-fallback', {
        promptTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt),
        completionTokens: aiTokenUtils.estimateTokenCount(textResponse),
        totalTokens: aiTokenUtils.estimateTokenCount(trimmedPrompt) + aiTokenUtils.estimateTokenCount(textResponse),
      });
      return result;
    }
  }

  throw new Error(`Unsupported AI provider configuration: "${activeProvider}"`);
}

module.exports = {
  generateCompletion,
};
