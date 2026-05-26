// src/utils/sanitizer.js
// Message payload sanitization utility to prevent XSS injections

/**
 * Sanitize a message string by stripping HTML tags and <script> blocks,
 * and trimming trailing/leading whitespace.
 * 
 * @param {string} text - Message payload text
 * @returns {string} Sanitized string
 */
function sanitizeMessage(text) {
  if (typeof text !== 'string') {
    return '';
  }

  return text
    .replace(/<script[^>]*>([\S\s]*?)<\/script>/gi, '') // Remove <script> ... </script> blocks
    .replace(/<\/?[^>]+(>|$)/g, '')                     // Remove HTML tags entirely
    .trim();
}

module.exports = {
  sanitizeMessage,
};
