// src/telemetry/logger.js
// Production Winston Structured JSON Logger with OpenTelemetry Context Correlation

const winston = require('winston');
const api = require('@opentelemetry/api');
const eventBus = require('./eventBus');

// Custom Winston format to inject OpenTelemetry trace and span IDs
const oTelTracingFormat = winston.format((info) => {
  try {
    const span = api.trace.getActiveSpan();
    if (span) {
      const spanContext = span.spanContext();
      if (spanContext && api.trace.isSpanContextValid(spanContext)) {
        info.trace_id = spanContext.traceId;
        info.span_id = spanContext.spanId;
      }
    }
  } catch (err) {
    // Silent catch to prevent telemetry errors from blocking logs
  }
  return info;
});

// Configure production winston logger
const winstonLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    oTelTracingFormat(),
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'scholar-backend' },
  transports: [
    new winston.transports.Console({
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
});

const log = {
  /**
   * Log info severity event
   */
  info(message, meta = {}, service = 'scholar-backend') {
    winstonLogger.info(message, { ...meta, service });
    // Emit to event bus for backwards compatibility
    eventBus.emit('log:info', 'info', { message, service, ...meta });
  },

  /**
   * Log warn severity event
   */
  warn(message, meta = {}, service = 'scholar-backend') {
    winstonLogger.warn(message, { ...meta, service });
    // Emit to event bus for backwards compatibility
    eventBus.emit('log:warn', 'warn', { message, service, ...meta });
  },

  /**
   * Log error severity event
   */
  error(message, meta = {}, service = 'scholar-backend') {
    winstonLogger.error(message, { ...meta, service });
    // Emit to event bus for backwards compatibility
    eventBus.emit('log:error', 'error', { message, service, ...meta });
  }
};

module.exports = log;
