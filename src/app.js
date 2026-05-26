// src/app.js
// Express application configuration

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csrfProtection = require('./middleware/csrf');
const requestSanitizer = require('./middleware/requestSanitizer');
const cacheControl = require('./middleware/cacheControl');

const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const studyRoomRoutes = require('./routes/studyRooms');
const focusSessionRoutes = require('./routes/focusSessions');
const analyticsRoutes = require('./routes/analytics');
const notificationRoutes = require('./routes/notifications');
const billingRoutes = require('./routes/billing');
const roomsRoutes = require('./routes/rooms');
const { router: aiRoutes } = require('./routes/ai');
const gamificationRoutes = require('./routes/gamification');
const env = require('./config/env');
const status = require('./config/status');

const app = express();

// Register Prometheus HTTP Latency & Counts tracking
const { requestMetricsMiddleware } = require('./middleware/requestMetrics');
const metricsRouter = require('./routes/metrics');
app.use(requestMetricsMiddleware);
app.use(metricsRouter);

const { correlationMiddleware } = require('./middleware/correlation');
app.use(correlationMiddleware);
app.use(cacheControl);

const isVercel = env.isVercel;
const clientOrigin = env.getClientOrigin();

env.validateApiEnv();

const { startRedisHealthMonitor } = require('./telemetry/redisHealth');
startRedisHealthMonitor(5000);

const trustProxiesEnv = process.env.TRUST_PROXIES;
if (trustProxiesEnv) {
  const parsedTrust = isNaN(Number(trustProxiesEnv)) ? trustProxiesEnv : Number(trustProxiesEnv);
  app.set('trust proxy', parsedTrust);
  console.log(`Trust proxy configured: ${parsedTrust}`);
} else if (isVercel) {
  app.set('trust proxy', 1);
  console.log('Running in Vercel mode (trust proxy 1)');
} else {
  console.log('Running in local mode');
}

// Support multiple CORS origins from env (comma-separated) or fallback to dynamic origin resolving
const rawOrigins = process.env.CORS_ALLOWED_ORIGINS || clientOrigin;
const allowedCorsOrigins = rawOrigins.split(',').map(o => o.trim());
console.log(`API CORS allowed origins: ${allowedCorsOrigins.join(', ')}`);

// ─── Middleware ───────────────────────────────────────────────────────────────

// 1. Security Middleware
// Helmet sets various HTTP headers to help protect the app from well-known web vulnerabilities
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com"],
      connectSrc: ["'self'", "ws:", "wss:", "http://localhost", "https://localhost"], // For Socket.IO & Proxy routing
    }
  }
}));

// 2. CORS Configuration
// Restrict cross-origin resource sharing to trusted domains and define allowed methods/headers
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, or same-origin)
    if (!origin || allowedCorsOrigins.includes(origin) || allowedCorsOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error(`Origin ${origin} is not allowed by CORS rules`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

// 3. Request Logging
// Log HTTP requests to the console using morgan (useful for debugging and monitoring)
const currentEnv = process.env.NODE_ENV || 'development';
app.use(morgan(currentEnv === 'development' ? 'dev' : 'combined'));

// 4. Body Parsers & Compression
// Parse incoming JSON bodies, limit size to prevent payload exhaustion
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    if (req.originalUrl.includes('/webhook') || req.originalUrl.includes('/billing/webhook')) {
      req.rawBody = buf;
    }
  }
}));
// Compress response bodies for all requests, optimizing bandwidth
app.use(compression());

// 4.5 Cookie Parser
// Parse Cookie header and populate req.cookies with an object keyed by the cookie names.
app.use(cookieParser());

// 4.6 Production Security Layers (Request Sanitizer + CSRF Protection)
app.use(requestSanitizer);
app.use(csrfProtection);

// ─── Routes ──────────────────────────────────────────────────────────────────

// Prefix API routes with versioning (/api/v1) for easier future updates and backward compatibility
const API_VERSION = '/api/v1';

// Global Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});

// Apply rate limiter to all API routes
app.use(`${API_VERSION}/`, apiLimiter);

app.use(`${API_VERSION}/auth`, authRoutes);
app.use('/auth', authRoutes);
app.use(`${API_VERSION}/messages`, messageRoutes);
app.use(`${API_VERSION}/users`, userRoutes);
app.use(`${API_VERSION}/study-rooms`, studyRoomRoutes);
app.use(`${API_VERSION}/focus-sessions`, focusSessionRoutes);
app.use(`${API_VERSION}/analytics`, analyticsRoutes);
app.use(`${API_VERSION}/notifications`, notificationRoutes);
app.use('/notifications', notificationRoutes);
app.use(`${API_VERSION}/billing`, billingRoutes);
app.use('/billing', billingRoutes);
app.use(`${API_VERSION}/rooms`, roomsRoutes);
app.use('/rooms', roomsRoutes);
app.use(`${API_VERSION}/ai`, aiRoutes);
app.use('/ai', aiRoutes);
app.use(`${API_VERSION}/gamification`, gamificationRoutes);
app.use('/gamification', gamificationRoutes);

status.setAuthLoaded();

// ─── Health & Diagnostic ─────────────────────────────────────────────────────

const buildStatusResponse = () => {
  const systemStatus = status.getStatus();
  const healthy = systemStatus.systems.auth.loaded && systemStatus.systems.socket.loaded;

  return {
    status: healthy ? 'healthy' : 'initializing',
    timestamp: systemStatus.timestamp,
    uptime: systemStatus.uptime,
    memory: systemStatus.memory,
    systems: systemStatus.systems,
    metrics: systemStatus.metrics,
  };
};

app.get('/api/health', (req, res) => {
  const response = buildStatusResponse();
  res.status(response.status === 'healthy' ? 200 : 503).json(response);
});

// ─── Error Handling ──────────────────────────────────────────────────────────

// 1. 404 handler for unknown routes
app.use((req, res, next) => {
  res.status(404).json({
    status: 'error',
    message: `Cannot find ${req.method} ${req.originalUrl} on this server`
  });
});

// 2. Global error handler
// Provides standardized error responses, stripping stack traces in production
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(statusCode).json({
    status: 'error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Centralized error tracking hooks for unhandled process anomalies
process.on('uncaughtException', (err) => {
  console.error('[FATAL UNCAUGHT EXCEPTION]:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL UNHANDLED REJECTION]:', reason.stack || reason);
});

module.exports = app;
