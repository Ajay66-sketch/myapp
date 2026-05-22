// src/app.js
// Express application configuration

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');

const authRoutes = require('./routes/auth');
const messageRoutes = require('./routes/messages');
const userRoutes = require('./routes/users');
const studyRoomRoutes = require('./routes/studyRooms');
const focusSessionRoutes = require('./routes/focusSessions');
const analyticsRoutes = require('./routes/analytics');
const notificationRoutes = require('./routes/notifications');

const app = express();

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
      connectSrc: ["'self'", "ws:", "wss:"], // For Socket.IO
    }
  }
}));

// 2. CORS Configuration
// Restrict cross-origin resource sharing to trusted domains and define allowed methods/headers
const corsOptions = {
  origin: process.env.CLIENT_URL || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

// 3. Request Logging
// Log HTTP requests to the console using morgan (useful for debugging and monitoring)
const env = process.env.NODE_ENV || 'development';
app.use(morgan(env === 'development' ? 'dev' : 'combined'));

// 4. Body Parsers & Compression
// Parse incoming JSON bodies, limit size to prevent payload exhaustion
app.use(express.json({ limit: '1mb' }));
// Compress response bodies for all requests, optimizing bandwidth
app.use(compression());

// 4.5 Cookie Parser
// Parse Cookie header and populate req.cookies with an object keyed by the cookie names.
app.use(cookieParser());

// 5. Serve Frontend UI
// Serve the premium realtime study room frontend with caching
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: '1d' // Cache assets for 1 day in production
}));

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
app.use(`${API_VERSION}/messages`, messageRoutes);
app.use(`${API_VERSION}/users`, userRoutes);
app.use(`${API_VERSION}/study-rooms`, studyRoomRoutes);
app.use(`${API_VERSION}/focus-sessions`, focusSessionRoutes);
app.use(`${API_VERSION}/analytics`, analyticsRoutes);
app.use(`${API_VERSION}/notifications`, notificationRoutes);

// ─── Health & Diagnostic ─────────────────────────────────────────────────────

// Improved health check endpoint including server uptime and current timestamp
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Server is running',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
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

module.exports = app;
