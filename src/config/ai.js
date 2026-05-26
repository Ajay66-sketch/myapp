// src/config/ai.js
// Centralized configuration settings for the AI Assistant Layer

module.exports = {
  // Provider Selection: environment driven ('mock' | 'openai' | 'local')
  provider: process.env.AI_PROVIDER || 'mock',

  // Completion token settings
  maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1024', 10),
  cacheTtlSeconds: parseInt(process.env.AI_CACHE_TTL_SECONDS || '300', 10),
  promptTokenBudget: parseInt(process.env.AI_PROMPT_TOKEN_BUDGET || '1200', 10),

  // Network timeouts in milliseconds
  timeout: parseInt(process.env.AI_TIMEOUT || '12000', 10),

  // Network retry counts for connection losses
  retryCounts: parseInt(process.env.AI_RETRYS || '2', 10),

  // Prompt safety settings
  safety: {
    // Maximum character length for an inbound prompt payload
    promptCharLimit: parseInt(process.env.AI_PROMPT_LIMIT || '4000', 10),

    // Regular expressions to flag common prompt injection and instructions override attempts
    injectionPatterns: [
      /ignore\s+(all\s+)?previous\s+instructions/gi,
      /ignore\s+system\s+instructions/gi,
      /you\s+are\s+now\s+an\s+admin/gi,
      /override\s+system\s+role/gi,
      /forget\s+everything\s+before/gi,
      /system\s+override/gi,
    ],
  },

  // Remote providers URLs and keys
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    url: 'https://api.openai.com/v1/chat/completions',
  },

  local: {
    model: process.env.LOCAL_MODEL || 'llama3',
    url: process.env.LOCAL_LLM_URL || 'http://localhost:11434/v1/chat/completions',
  },

  // Base system directives for contextual operations
  systemInstructions: 'You are Antigravity AI, a premium, highly engaging study assistant built inside a realtime productivity SaaS platform. Keep answers highly helpful, concise, positive, and focused on assisting students.',
};
