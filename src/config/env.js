// src/config/env.js
// Centralized environment configuration and validation helpers

const { z } = require('zod');

// Bidirectional synchronization of alternative environment variable names
if (process.env.MONGODB_URI && !process.env.MONGO_URI) {
  process.env.MONGO_URI = process.env.MONGODB_URI;
}
if (process.env.MONGO_URI && !process.env.MONGODB_URI) {
  process.env.MONGODB_URI = process.env.MONGO_URI;
}
if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_API_KEY) {
  process.env.STRIPE_API_KEY = process.env.STRIPE_SECRET_KEY;
}
if (process.env.STRIPE_API_KEY && !process.env.STRIPE_SECRET_KEY) {
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_API_KEY;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'staging', 'test']).default('development'),
  PORT: z.string().optional().default('5000'),
  JWT_SECRET: z.string().optional(),
  MONGO_URI: z.string().optional(),
  MONGO_POOL_SIZE: z.string().optional().default('50'),
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.string().optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_MODE: z.enum(['standalone', 'sentinel', 'cluster']).optional().default('standalone'),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  CLIENT_URL: z.string().optional(),
  API_URL: z.string().optional(),
  SOCKET_CLIENT_URL: z.string().optional(),
  COOKIE_SECURE: z.string().optional().default('true'),
  COOKIE_SAME_SITE: z.string().optional().default('strict'),
  COOKIE_DOMAIN: z.string().optional(),
  DISABLE_CSRF: z.string().optional().default('false'),
  TRUST_PROXIES: z.string().optional(),
  STRIPE_API_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_MONTHLY_PRICE_ID: z.string().optional(),
  STRIPE_YEARLY_PRICE_ID: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  LOG_LEVEL: z.string().optional().default('info'),
  VAULT_ADDR: z.string().optional(),
  VAULT_TOKEN: z.string().optional(),
  VAULT_SECRET_PATH: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  POSTHOG_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
});

let validatedEnv = {};
try {
  // Try to parse using Zod to check format correctness
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

  const currentEnv = process.env.NODE_ENV || 'development';
  if (currentEnv === 'production' || currentEnv === 'staging') {
    throw new Error('JWT_SECRET is required in production/staging');
  }

  console.warn(
    '⚠️ JWT_SECRET is not set. Using fallback development secret. Do not use this in production/staging.'
  );
  return 'dev-jwt-secret-unsafe';
}

function validateApiEnv() {
  const currentEnv = process.env.NODE_ENV || 'development';
  const isProdOrStaging = currentEnv === 'production' || currentEnv === 'staging';

  if (isProdOrStaging) {
    const errors = [];

    // 1. JWT_SECRET checks
    if (!process.env.JWT_SECRET) {
      errors.push('JWT_SECRET is required in production/staging.');
    } else {
      const weakSecrets = [
        'secret',
        '123456',
        'password',
        'jwtsecret',
        'dev-jwt-secret-unsafe',
        'antigravity',
        'staging_super_secret_key_antigravity_54321',
        'production_change_me_to_something_extremely_random_and_secure_9999'
      ];
      if (process.env.JWT_SECRET.length < 32 || weakSecrets.includes(process.env.JWT_SECRET.toLowerCase())) {
        errors.push('Weak/insecure JWT_SECRET detected. Secret must be at least 32 cryptographically strong characters.');
      }
    }

    // 2. Database checks (MONGODB_URI / MONGO_URI)
    if (!process.env.MONGODB_URI) {
      errors.push('MONGODB_URI (or MONGO_URI) is required in production/staging.');
    }

    // 3. Redis checks
    if (!process.env.REDIS_URL && !process.env.REDIS_HOST) {
      errors.push('REDIS_URL or REDIS_HOST is required in production/staging.');
    }

    // 4. CORS/Origin checks
    if (!process.env.CLIENT_URL && !process.env.CORS_ALLOWED_ORIGINS && !process.env.VERCEL_URL) {
      errors.push('CLIENT_URL or CORS_ALLOWED_ORIGINS is required in production/staging.');
    }

    // 5. Stripe checks (STRIPE_SECRET_KEY / STRIPE_API_KEY)
    if (!process.env.STRIPE_SECRET_KEY) {
      errors.push('STRIPE_SECRET_KEY (or STRIPE_API_KEY) is required in production/staging.');
    }
    if (!process.env.STRIPE_WEBHOOK_SECRET) errors.push('STRIPE_WEBHOOK_SECRET is required in production/staging.');
    if (!process.env.STRIPE_MONTHLY_PRICE_ID) errors.push('STRIPE_MONTHLY_PRICE_ID is required in production/staging.');
    if (!process.env.STRIPE_YEARLY_PRICE_ID) errors.push('STRIPE_YEARLY_PRICE_ID is required in production/staging.');

    // 6. PostHog Analytics checks
    if (!process.env.POSTHOG_API_KEY) errors.push('POSTHOG_API_KEY is required in production/staging.');
    if (!process.env.POSTHOG_HOST) errors.push('POSTHOG_HOST is required in production/staging.');

    // 7. OpenAI API Key check
    if (!process.env.OPENAI_API_KEY) {
      errors.push('OPENAI_API_KEY is required in production/staging.');
    }

    if (errors.length > 0) {
      console.error('❌ PRODUCTION/STAGING CONFIGURATION CRITICAL ERROR:');
      errors.forEach((err) => console.error(`   - ${err}`));
      process.exit(1);
    }
  } else {
    if (!process.env.CLIENT_URL && !process.env.VERCEL_URL) {
      console.warn(
        '⚠️ API service CORS origin is not explicitly configured. Set CLIENT_URL or rely on VERCEL_URL for production.'
      );
    }
  }
}

function validateSocketEnv() {
  const currentEnv = process.env.NODE_ENV || 'development';
  if (!process.env.SOCKET_CLIENT_URL && !process.env.CLIENT_URL && !process.env.VERCEL_URL) {
    if (currentEnv === 'production' || currentEnv === 'staging') {
      console.error('❌ SOCKET ALLOWED ORIGINS are missing in production/staging!');
      process.exit(1);
    } else {
      console.warn(
        '⚠️ Socket service allowed origins are not explicitly configured. Set SOCKET_CLIENT_URL, CLIENT_URL, or VERCEL_URL for production.'
      );
    }
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
