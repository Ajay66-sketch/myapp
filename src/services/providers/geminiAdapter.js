// src/services/providers/geminiAdapter.js
// Google Gemini API completion and streaming adapter with standardized output shape.

const aiConfig = require('../../config/ai');
const { callRemoteProvider } = require('./remoteProvider');

async function requestGeminiCompletion({ systemPrompt, prompt, maxTokens, signal = null }) {
  if (!aiConfig.gemini.apiKey) {
    throw new Error('Gemini API Key is missing.');
  }

  const model = aiConfig.gemini.model;
  const url = `${aiConfig.gemini.url}/${model}:generateContent?key=${aiConfig.gemini.apiKey}`;

  const headers = {};
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\n${prompt}` }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7,
    },
  };

  const data = await callRemoteProvider(url, headers, body, aiConfig.retryCounts, 1000, signal);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const usage = data.usageMetadata || {};

  return {
    response: text.trim(),
    usage: {
      promptTokens: usage.promptTokenCount || 0,
      completionTokens: usage.candidatesTokenCount || 0,
      totalTokens: usage.totalTokenCount || 0,
    },
  };
}

async function* requestGeminiCompletionStream({ systemPrompt, prompt, maxTokens, signal = null }) {
  if (!aiConfig.gemini.apiKey) {
    throw new Error('Gemini API Key is missing.');
  }

  const model = aiConfig.gemini.model;
  // Google Gemini Developer API stream endpoint
  const url = `${aiConfig.gemini.url}/${model}:streamGenerateContent?key=${aiConfig.gemini.apiKey}`;

  const headers = {
    'Content-Type': 'application/json',
  };

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: `${systemPrompt}\n\n${prompt}` }],
      },
    ],
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7,
    },
  };

  let response;
  let retries = aiConfig.retryCounts;
  let delay = 1000;

  while (true) {
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      });

      if (response.ok) break;

      const text = await response.text();
      throw new Error(`Gemini Stream HTTP error! status: ${response.status}, body: ${text}`);
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

      // Gemini's stream format is a JSON array of response parts.
      // We parse items out of this array by searching for candidates structure.
      // Let's perform a resilient regex scan or substring extract for text content parts:
      // "text": "..."
      // Let's parse JSON blocks if possible, or extract candidates parts dynamically.
      let match;
      // Resilient regex scan for candidate text parts in the stream payload
      const regex = /"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g;
      
      while ((match = regex.exec(buffer)) !== null) {
        try {
          // Unescape JS/JSON string token
          const token = JSON.parse(`"${match[1]}"`);
          if (token) {
            yield { token, done: false };
          }
        } catch (e) {
          // Ignore partial decode issues
        }
      }
      
      // Keep only a reasonable buffer trailing edge to prevent unbounded memory growth
      if (buffer.length > 8192) {
        buffer = buffer.slice(-1024);
      }
    }
  } finally {
    reader.releaseLock();
  }

  yield { token: '', done: true };
}

module.exports = {
  requestGeminiCompletion,
  requestGeminiCompletionStream,
};
