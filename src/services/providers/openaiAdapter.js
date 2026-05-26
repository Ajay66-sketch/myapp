// src/services/providers/openaiAdapter.js
// OpenAI completion adapter with standardized output shape.

const aiConfig = require('../../config/ai');
const { callRemoteProvider } = require('./remoteProvider');

async function requestOpenAICompletion({ systemPrompt, prompt, maxTokens }) {
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

  const data = await callRemoteProvider(aiConfig.openai.url, headers, body);

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

module.exports = {
  requestOpenAICompletion,
};
