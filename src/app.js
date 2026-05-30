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

const globalRouter = require('./routes');
const { checkIpBan } = require('./middleware/rateLimitBanning');
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

// Enforce proactive IP Ban verification at gateway entry
app.use(checkIpBan);

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

app.use(globalRouter);

// Register RFC 9116 security researcher contact details endpoint
app.get('/.well-known/security.txt', (req, res) => {
  res.type('text/plain');
  res.send(
    `Contact: mailto:security@scholarplatform.com\n` +
    `Expires: 2027-05-27T02:00:00.000Z\n` +
    `Encryption: https://scholarplatform.com/security-pgp.asc\n` +
    `Policy: https://scholarplatform.com/security-policy\n`
  );
});

status.setAuthLoaded();

// ─── Health & Diagnostic Probes (SRE-grade Kubernetes-compliant) ─────────────

// 1. Central Comprehensive Health Diagnostic
app.get('/api/health', async (req, res) => {
  const mongoose = require('mongoose');
  const { getRedisClient } = require('./config/redisClient');
  
  const mongoConnected = mongoose.connection && mongoose.connection.readyState === 1;
  const redis = getRedisClient();
  const redisConnected = redis && redis.status === 'ready';
  
  // Collect queue statuses
  const aiTutorQueue = require('./queue/aiTutorQueue');
  const notificationQueue = require('./queue/notificationQueue');
  const telemetryQueue = require('./queue/telemetryQueue');
  const analyticsQueue = require('./queue/analyticsQueue');
  const { aiQueue } = require('./queue/aiQueue');

  const queues = [
    aiTutorQueue.getMetrics(),
    notificationQueue.getMetrics(),
    telemetryQueue.getMetrics(),
    analyticsQueue.getMetrics(),
    aiQueue.getMetrics()
  ];

  // Socket state
  let socketHealthy = false;
  let activeConnections = 0;
  try {
    const presenceService = require('./socket/presence/presenceService');
    activeConnections = presenceService.onlineUsers ? presenceService.onlineUsers.size : 0;
    socketHealthy = status.getStatus().systems.socket.loaded;
  } catch (e) {}

  // Fetch active worker heartbeats from Redis (Task 6)
  let activeWorkersList = [];
  if (redisConnected) {
    try {
      const keys = await redis.keys('worker:health:*');
      for (const key of keys) {
        const data = await redis.get(key);
        if (data) {
          activeWorkersList.push(JSON.parse(data));
        }
      }
    } catch (e) {
      console.warn('Failed to fetch worker heartbeats:', e.message);
    }
  }

  const overallHealthy = mongoConnected && (!process.env.REDIS_URL || redisConnected) && socketHealthy;
  const systemStatus = status.getStatus();

  res.status(overallHealthy ? 200 : 503).json({
    status: overallHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: systemStatus.memory,
    metrics: systemStatus.metrics,
    systems: {
      mongodb: {
        status: mongoConnected ? 'connected' : 'offline',
        healthy: mongoConnected
      },
      redis: {
        status: redisConnected ? 'connected' : (process.env.REDIS_URL || process.env.REDIS_HOST ? 'offline' : 'not_configured'),
        healthy: !process.env.REDIS_URL || redisConnected
      },
      websocket: {
        status: socketHealthy ? 'active' : 'offline',
        activeConnections,
        healthy: socketHealthy
      },
      queues: {
        healthy: queues.every(q => !q.bullMqActive || q.bullMqActive),
        list: queues
      },
      workers: {
        activeCount: activeWorkersList.length,
        list: activeWorkersList
      }
    }
  });
});

// 2. Kubernetes Liveness Probe
app.get('/api/health/liveness', (req, res) => {
  res.status(200).json({ status: 'alive', timestamp: new Date().toISOString() });
});

// 3. Kubernetes Readiness Probe
app.get('/api/health/readiness', async (req, res) => {
  const mongoose = require('mongoose');
  const { getRedisClient } = require('./config/redisClient');
  
  const mongoConnected = mongoose.connection && mongoose.connection.readyState === 1;
  const redis = getRedisClient();
  const redisConnected = redis && redis.status === 'ready';
  const socketLoaded = status.getStatus().systems.socket.loaded;
  
  let activeWorkersCount = 0;
  if (redisConnected) {
    try {
      const keys = await redis.keys('worker:health:*');
      activeWorkersCount = keys.length;
    } catch (e) {}
  }

  const isProdOrStaging = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  const isReady = mongoConnected && (!isProdOrStaging || redisConnected) && socketLoaded;
  
  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks: {
      mongodb: mongoConnected,
      redis: redisConnected,
      websocket: socketLoaded,
      workersActiveCount: activeWorkersCount
    }
  });
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
const globalErrorHandler = require('./middleware/errorHandler');
app.use(globalErrorHandler);

// Centralized error tracking hooks for unhandled process anomalies
process.on('uncaughtException', (err) => {
  console.error('[FATAL UNCAUGHT EXCEPTION]:', err.stack || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[FATAL UNHANDLED REJECTION]:', reason.stack || reason);
});

module.exports = app;
