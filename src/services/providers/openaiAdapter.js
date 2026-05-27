// src/services/providers/openaiAdapter.js
// OpenAI completion and streaming adapter with standardized output shape.

const aiConfig = require('../../config/ai');
const { callRemoteProvider } = require('./remoteProvider');

async function requestOpenAICompletion({ systemPrompt, prompt, maxTokens, signal = null }) {
  if (!aiConfig.openai.apiKey) {
    throw new Error('OpenAI API Key is missing.');
  }

  const headers = {
    Authorization: `Bearer ${aiConfig.openai.apiKey}`,
  };

  const body = {
    model: aiConfig.openai.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    max_tokens: maxTokens,
    temperature: 0.7,
  };

  const data = await callRemoteProvider(aiConfig.openai.url, headers, body, aiConfig.retryCounts, 1000, signal);

  const text = data.choices?.[0]?.message?.content || '';

  return {
    response: text.trim(),
    usage: {
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      totalTokens: data.usage?.total_tokens || 0,
    },
  };
}

async function* requestOpenAICompletionStream({ systemPrompt, prompt, maxTokens, signal = null }) {
  if (!aiConfig.openai.apiKey) {
    throw new Error('OpenAI API Key is missing.');
  }

  const headers = {
    Authorization: `Bearer ${aiConfig.openai.apiKey}`,
    'Content-Type': 'application/json',
  };

  const body = {
    model: aiConfig.openai.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
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
      response = await fetch(aiConfig.openai.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (response.ok) break;

      const text = await response.text();
      throw new Error(`OpenAI Stream HTTP error! status: ${response.status}, body: ${text}`);
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
          const token = parsed.choices?.[0]?.delta?.content;
          if (token) {
            yield { token, done: false };
          }
        } catch (err) {
          // Ignore partial decode issues
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { token: '', done: true };
}

module.exports = {
  requestOpenAICompletion,
  requestOpenAICompletionStream,
};
