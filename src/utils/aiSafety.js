// src/utils/aiSafety.js
// Safety layer utility for validating LLM prompt payloads, timeouts, and safe fallbacks

const aiConfig = require('../config/ai');

/**
 * Sanitize the input prompt, stripping HTML structures and trimming whitespace.
 * 
 * @param {string} prompt - Inbound raw text
 * @returns {string} Sanitized string
 */
function sanitizePrompt(prompt) {
  if (typeof prompt !== 'string') {
    return '';
  }

  return prompt
    .replace(/<script[^>]*>([\S\s]*?)<\/script>/gi, '') // Remove <script> ... </script> blocks
    .replace(/<\/?[^>]+(>|$)/g, '')                     // Remove HTML tags entirely
    .trim();
}

/**
 * Check if the prompt triggers any prompt injection or override patterns.
 * 
 * @param {string} prompt - Clean prompt text
 * @returns {boolean} True if a prompt injection is detected
 */
function detectPromptInjection(prompt) {
  if (!prompt) return false;

  for (const pattern of aiConfig.safety.injectionPatterns) {
    if (pattern.test(prompt)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate that prompt size fits within character limitations.
 * 
 * @param {string} prompt - Clean prompt text
 * @returns {boolean} True if the prompt length is within limits
 */
function validatePromptSize(prompt) {
  if (!prompt) return false;
  return prompt.length <= aiConfig.safety.promptCharLimit;
}

/**
 * Wrap a promise execution with a strict timeout control.
 * 
 * @param {Promise} promise - The completion promise to resolve
 * @param {number} [ms] - Specific timeout duration, defaults to config timeout
 * @returns {Promise} Resolves or throws a Timeout Error
 */
function wrapTimeout(promise, ms = aiConfig.timeout) {
  let timer;
  
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error('AI Provider request timed out');
      err.code = 'AI_TIMEOUT';
      reject(err);
    }, ms);
  });

  return Promise.race([
    promise.then((res) => {
      clearTimeout(timer);
      return res;
    }),
    timeoutPromise,
  ]);
}

/**
 * Produce a safe, helpful fallback answer when an external provider goes offline.
 * 
 * @param {Error} error - Triggered exception details
 * @param {string} [contextType='general'] - Completion type context
 * @returns {object} Uniform output message body matching provider facade schemas
 */
function getSafeFallback(error, contextType = 'general') {
  let fallbackMessage = 'The AI assistant is temporarily unavailable as we optimize system parameters. Please try again in a few moments.';

  if (error && error.code === 'AI_TIMEOUT') {
    fallbackMessage = 'The AI assistant response timed out due to high traffic volumes. We are processing queries as quickly as possible. Please try again.';
  } else if (contextType === 'summarize') {
    fallbackMessage = 'Unable to generate room summary at this time. Our background AI summarizer is currently offline.';
  } else if (contextType === 'room-assistant') {
    fallbackMessage = 'I am currently unable to analyze this study room context. Feel free to continue focus chatting with peers!';
  }

  return {
    response: fallbackMessage,
    provider: 'fallback',
    usage: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    },
    timestamp: new Date().toISOString(),
    isFallback: true,
  };
}

module.exports = {
  sanitizePrompt,
  detectPromptInjection,
  validatePromptSize,
  wrapTimeout,
  getSafeFallback,
};
