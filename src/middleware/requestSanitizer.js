// src/middleware/requestSanitizer.js
// Production request sanitization middleware protecting against NoSQL Injection and XSS Injection

/**
 * Clean a string value against basic script/HTML injections
 */
function sanitizeString(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return value
    .replace(/<script[^>]*>([\S\s]*?)<\/script>/gi, '') // Remove script blocks
    .replace(/<\/?[^>]+(>|$)/g, '')                     // Strip HTML tags
    .trim();
}

/**
 * Recursively traverse and sanitize objects against NoSQL operator injection and XSS
 */
function sanitizeObject(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  // Handle arrays
  if (Array.isArray(obj)) {
    return obj.map(item => {
      if (typeof item === 'string') {
        return sanitizeString(item);
      }
      if (typeof item === 'object') {
        return sanitizeObject(item);
      }
      return item;
    });
  }

  // Handle nested objects
  const sanitized = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      // 1. Prevent NoSQL Injection: Remove keys starting with $ (MongoDB operators)
      if (key.startsWith('$')) {
        console.warn(`[Security Intervention] Sanitized NoSQL injection attempt: key "${key}" removed.`);
        continue;
      }

      const value = obj[key];

      // 2. Sanitize value depending on its type
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized;
}

/**
 * Request Sanitizer Middleware
 */
const requestSanitizer = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeObject(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeObject(req.params);
  }
  next();
};

module.exports = requestSanitizer;
