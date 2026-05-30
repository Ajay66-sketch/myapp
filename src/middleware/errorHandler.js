// src/middleware/errorHandler.js
// Centralized global error handling middleware with Winston Structured Logging and OTel context correlation.

const logger = require('../telemetry/logger');

function globalErrorHandler(err, req, res, next) {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  const errorMeta = {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1',
    correlationId: req.correlationId || req.headers['x-correlation-id'] || 'unknown',
    statusCode,
  };

  const isProdOrStaging = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';

  if (statusCode >= 500) {
    // Structured log for server failures with stack details
    logger.error(`[InternalServerError] ${message}`, {
      ...errorMeta,
      errorName: err.name,
      stack: err.stack,
    });
  } else {
    // Log client input/auth errors as warnings
    logger.warn(`[ClientError] ${message}`, {
      ...errorMeta,
      errorName: err.name,
    });
  }

  // Define structured JSON payload
  const responsePayload = {
    status: 'error',
    message: statusCode >= 500 && isProdOrStaging ? 'Internal server error' : message,
  };

  // Expose stack trace in development and testing environments only
  const isDevOrTest = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (isDevOrTest && err.stack) {
    responsePayload.stack = err.stack;
  }

  res.status(statusCode).json(responsePayload);
}

module.exports = globalErrorHandler;
