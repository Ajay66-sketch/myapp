// src/utils/aiTokenUtils.js
// Token estimate and prompt trimming utilities for AI request budgets.

const aiConfig = require('../config/ai');

function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.max(0, Math.ceil(text.length / 4));
}

function trimPromptToBudget({ systemPrompt, prompt, maxPromptTokens }) {
  const budget = Number(maxPromptTokens || aiConfig.promptTokenBudget || 1200);
  const systemTokens = estimateTokenCount(systemPrompt || '');
  const availableTokens = Math.max(0, budget - systemTokens);

  if (availableTokens <= 0) {
    return prompt; // Cannot safely trim without dropping system prompt.
  }

  const promptTokens = estimateTokenCount(prompt);
  if (promptTokens <= availableTokens) {
    return prompt;
  }

  const lines = prompt.split(/\r?\n/).filter(Boolean);
  const trimmedLines = [];
  let reversedBuffer = [];

  for (let i = lines.length - 1; i >= 0; i--) {
    reversedBuffer.unshift(lines[i]);
    const candidate = reversedBuffer.join('\n');
    if (estimateTokenCount(candidate) > availableTokens) {
      reversedBuffer.shift();
      break;
    }
  }

  if (reversedBuffer.length === 0) {
    return lines[lines.length - 1] || '';
  }

  return reversedBuffer.join('\n');
}

/**
 * Optimizes prompts by stripping conversational filler words and compacting whitespace.
 */
function optimizePrompt(text) {
  if (!text || typeof text !== 'string') return '';
  
  let clean = text.trim();
  
  // Replace conversational prefixes/fillers case-insensitively
  const fillers = [
    /^(please|hello|hi|hey|could you|can you|would you mind|would you please)\s+/i,
    /\b(please|can you|could you|thank you very much|thanks in advance)\b/ig
  ];
  
  fillers.forEach(regex => {
    clean = clean.replace(regex, '');
  });
  
  // Compact redundant multi-spaces/newlines
  return clean.replace(/[ \t]+/g, ' ').trim();
}

module.exports = {
  estimateTokenCount,
  trimPromptToBudget,
  optimizePrompt,
};
