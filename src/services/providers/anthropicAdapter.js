// src/services/providers/anthropicAdapter.js
// Anthropic (Claude Sonnet) completion and streaming adapter with standardized output shape.

const aiConfig = require('../../config/ai');
const { callRemoteProvider } = require('./remoteProvider');

async function requestAnthropicCompletion({ systemPrompt, prompt, maxTokens, signal = null }) {
  if (!aiConfig.anthropic.apiKey) {
    throw new Error('Anthropic API Key is missing.');
  }

  const headers = {
    'x-api-key': aiConfig.anthropic.apiKey,
    'anthropic-version': '2023-06-01',
  };

  const body = {
    model: aiConfig.anthropic.model,
    system: systemPrompt,
    messages: [
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  };

  const data = await callRemoteProvider(aiConfig.anthropic.url, headers, body, aiConfig.retryCounts, 1000, signal);

  const text = data.content?.[0]?.text || '';
  const usage = data.usage || {};

  return {
    response: text.trim(),
    usage: {
      promptTokens: usage.input_tokens || 0,
      completionTokens: usage.output_tokens || 0,
      totalTokens: (usage.input_tokens || 0) + (usage.output_tokens || 0),
    },
  };
}

async function* requestAnthropicCompletionStream({ systemPrompt, prompt, maxTokens, signal = null }) {
  if (!aiConfig.anthropic.apiKey) {
    throw new Error('Anthropic API Key is missing.');
  }

  const headers = {
    'x-api-key': aiConfig.anthropic.apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };

  const body = {
    model: aiConfig.anthropic.model,
    system: systemPrompt,
    messages: [
      { role: 'user', content: prompt }
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
    stream: true,
  };

  let response;
  let retries = aiConfig.retryCounts;
  let delay = 1000;

  while (true) {
    try {
      response = await fetch(aiConfig.anthropic.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (response.ok) break;

      const text = await response.text();
      throw new Error(`Anthropic Stream HTTP error! status: ${response.status}, body: ${text}`);
    } catch (error) {
      if (error.name === 'AbortError' || retries <= 0) {
        throw error;
      }
      retries--;
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield { token: parsed.delta.text, done: false };
          }
        } catch (err) {
          // Ignore partial or control chunk parse issues
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { token: '', done: true };
}

module.exports = {
  requestAnthropicCompletion,
  requestAnthropicCompletionStream,
};
