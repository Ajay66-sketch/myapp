// src/middleware/correlation.js
// Enterprise-grade tracing middleware generating correlation IDs for multi-service context tracking

const crypto = require('crypto');

/**
 * Express middleware to inject and track correlation IDs
 */
function correlationMiddleware(req, res, next) {
  // Respect existing upstream gateway tracer headers, or generate new ones
  const correlationId = req.headers['x-correlation-id'] || req.headers['x-request-id'] || crypto.randomUUID();
  
  req.correlationId = correlationId;
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}

module.exports = { correlationMiddleware };
