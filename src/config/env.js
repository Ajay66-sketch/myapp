// src/config/env.js
// Centralized environment configuration and validation helpers

const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().optional().default('5000'),
  JWT_SECRET: z.string().min(4).catch('dev-jwt-secret-unsafe'),
  STRIPE_API_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_YEARLY_PRICE_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  POSTHOG_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

let validatedEnv = {};
try {
  validatedEnv = envSchema.parse(process.env);
} catch (error) {
  console.error('❌ Environment validation failed:', error.message);
  process.exit(1);
}

const isVercel = Boolean(process.env.VERCEL);

function getClientOrigin() {
  if (process.env.CLIENT_URL) {
    return process.env.CLIENT_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

function getApiOrigin() {
  if (process.env.API_URL) {
    return process.env.API_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:5000';
}

function getSocketOrigin() {
  if (process.env.SOCKET_CLIENT_URL) {
    return process.env.SOCKET_CLIENT_URL;
  }
  return getClientOrigin();
}

function getSocketAllowedOrigins() {
  const origins = new Set();

  const clientOrigin = getClientOrigin();
  if (clientOrigin) origins.add(clientOrigin);

  const apiOrigin = getApiOrigin();
  if (apiOrigin) origins.add(apiOrigin);

  if (process.env.SOCKET_CLIENT_URL) {
    origins.add(process.env.SOCKET_CLIENT_URL);
  }

  return Array.from(origins);
}

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET is required in production');
  }

  console.warn(
    '⚠️ JWT_SECRET is not set. Using fallback development secret. Do not use this in production.'
  );
  return 'dev-jwt-secret-unsafe';
}

function validateApiEnv() {
  if (!process.env.CLIENT_URL && !process.env.VERCEL_URL) {
    console.warn(
      '⚠️ API service CORS origin is not explicitly configured. Set CLIENT_URL or rely on VERCEL_URL for production.'
    );
  }

  if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
    console.error('❌ JWT_SECRET is required in production.');
    process.exit(1);
  }
}

function validateSocketEnv() {
  if (!process.env.SOCKET_CLIENT_URL && !process.env.CLIENT_URL && !process.env.VERCEL_URL) {
    console.warn(
      '⚠️ Socket service allowed origins are not explicitly configured. Set SOCKET_CLIENT_URL, CLIENT_URL, or VERCEL_URL for production.'
    );
  }
}

module.exports = {
  isVercel,
  getClientOrigin,
  getApiOrigin,
  getSocketOrigin,
  getSocketAllowedOrigins,
  getJwtSecret,
  validateApiEnv,
  validateSocketEnv,
};
