// src/config/env.js
// Centralized environment configuration and SRE-grade validation helpers

require('./envLoader');
const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'staging', 'test']).default('development'),
  PORT: z.string().optional().default('5000'),
  JWT_SECRET: z.string().optional(),
  MONGODB_URI: z.string().optional(),
  MONGO_POOL_SIZE: z.string().optional().default('50'),
  REDIS_URL: z.string().optional(),
  CORS_ALLOWED_ORIGINS: z.string().optional(),
  CLIENT_URL: z.string().optional(),
  API_URL: z.string().optional(),
  SOCKET_CLIENT_URL: z.string().optional(),
  COOKIE_SECURE: z.string().optional().default('true'),
  COOKIE_SAME_SITE: z.string().optional().default('strict'),
  COOKIE_DOMAIN: z.string().optional(),
  DISABLE_CSRF: z.string().optional().default('false'),
  TRUST_PROXIES: z.string().optional(),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_MONTHLY_PRICE: z.string().optional(),
  RAZORPAY_YEARLY_PRICE: z.string().optional(),
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

// Use safeParse to ensure NO import-time crashes.
// All configuration validations are deferred to controlled pre-boot or runtime checks.
const parseResult = envSchema.safeParse(process.env);
const validatedEnv = parseResult.success ? parseResult.data : {};

const isVercel = Boolean(process.env.VERCEL);

function getClientOrigin() {
  if (process.env.CLIENT_URL) {
    return process.env.CLIENT_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  const currentEnv = process.env.NODE_ENV || 'development';
  if (currentEnv === 'production') {
    console.warn('[CHAOS][BOOT][DEGRADED MODE] Client URL unavailable → CORS degraded');
    return 'http://localhost:3000';
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
  const currentEnv = process.env.NODE_ENV || 'development';
  if (currentEnv === 'production') {
    console.warn('[CHAOS][BOOT][DEGRADED MODE] API URL unavailable → falling back');
    return 'http://localhost:5000';
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

// Visual color codes for audit reporting
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
  reset: '\x1b[0m'
};

const weakSecrets = [
  'secret', '123456', 'password', 'jwtsecret', 'dev-jwt-secret-unsafe',
  'antigravity', 'staging_super_secret_key_antigravity_54321',
  'production_change_me_to_something_extremely_random_and_secure_9999'
];

/**
 * SRE visual report generator and central environment auditor.
 */
function runPreBootAudit() {
  // Prevent duplicate visual reports within the same process lifecycle
  if (global.__preBootAuditExecuted) {
    return;
  }
  global.__preBootAuditExecuted = true;

  const currentEnv = process.env.NODE_ENV || 'development';
  const isProdOrStaging = currentEnv === 'production' || currentEnv === 'staging';
  const isChaosMode = process.env.CHAOS_MODE === 'true';

  console.log(`\n${colors.bold}${colors.blue}======================================================================${colors.reset}`);
  console.log(`🚀 ${colors.bold}${colors.magenta}SCHOLAR CORE INFRASTRUCTURE — PRE-BOOT SRE AUDIT REPORT${colors.reset}`);
  console.log(`${colors.bold}${colors.blue}======================================================================${colors.reset}`);
  console.log(`   Environment: ${colors.bold}${currentEnv.toUpperCase()}${colors.reset}`);
  console.log(`   Chaos Mode:  ${colors.bold}${isChaosMode ? colors.red + 'ENABLED' : colors.green + 'DISABLED'}${colors.reset}`);
  console.log(`   Timestamp:   ${new Date().toISOString()}`);
  console.log(`${colors.blue}----------------------------------------------------------------------${colors.reset}\n`);

  // A) CRITICAL REQUIRED VARIABLES (hard fail)
  const criticalVars = [
    { key: 'NODE_ENV', required: true, desc: 'Application runtime environment mode' },
    { key: 'JWT_SECRET', required: true, desc: 'JSON Web Token cryptographic signing key', check: (val) => {
        if (!val) return 'MISSING';
        if (val.length < 32) return 'WEAK (Length must be >= 32 chars)';
        if (weakSecrets.includes(val.toLowerCase())) return 'INSECURE (Uses a known placeholder)';
        return 'OK';
      }
    },
    { key: 'MONGODB_URI', required: true, desc: 'MongoDB primary database connection string' }
  ];

  if (isProdOrStaging) {
    criticalVars.push(
      { key: 'RAZORPAY_KEY_ID', required: true, desc: 'Razorpay Key ID' },
      { key: 'RAZORPAY_KEY_SECRET', required: true, desc: 'Razorpay Key Secret' },
      { key: 'RAZORPAY_WEBHOOK_SECRET', required: true, desc: 'Razorpay webhook signature key verification' }
    );
  }

  // B) OPTIONAL SERVICES VARIABLES (soft fail - warn & continue)
  const optionalServicesVars = [
    { key: 'REDIS_URL', desc: 'Redis connection string', consequence: 'Redis unavailable → queue disabled' },
    ...(isProdOrStaging ? [] : [
      { key: 'RAZORPAY_KEY_ID', desc: 'Razorpay Key ID', consequence: 'Razorpay unavailable → billing disabled' },
      { key: 'RAZORPAY_KEY_SECRET', desc: 'Razorpay Key Secret', consequence: 'Razorpay unavailable → billing disabled' },
      { key: 'RAZORPAY_WEBHOOK_SECRET', desc: 'Razorpay webhook signature key verification', consequence: 'Razorpay Webhook Secret unavailable → webhook disabled' }
    ]),
    { key: 'OPENAI_API_KEY', desc: 'OpenAI platform secret integration API key', consequence: 'OpenAI unavailable → AI engine disabled' },
    { key: 'POSTHOG_API_KEY', desc: 'PostHog analytics API key for product cohorts', consequence: 'PostHog unavailable → telemetry disabled' },
    { key: 'CLIENT_URL', desc: 'Primary frontend origin URL', consequence: 'Client URL unavailable → CORS degraded' }
  ];

  const optionalVars = [
    { key: 'PORT', default: '5000', desc: 'Application API server port' },
    { key: 'MONGO_POOL_SIZE', default: '50', desc: 'MongoDB connection pool size cap' },
    { key: 'COOKIE_SECURE', default: 'true', desc: 'Enforces HTTPS secure cookie transmission' },
    { key: 'COOKIE_SAME_SITE', default: 'strict', desc: 'Session cookie CSRF protection directive' },
    { key: 'DISABLE_CSRF', default: 'false', desc: 'Explicitly disables CSRF protection layer (dangerous!)' },
    { key: 'LOG_LEVEL', default: 'info', desc: 'SRE logging verbosity limit configuration' }
  ];

  let fatalCount = 0;
  let warnCount = 0;

  // 1. Audit Critical Required Variables
  console.log(`${colors.bold}${colors.blue}[ CORE CRITICAL VARIABLES STATUS ]${colors.reset}`);
  criticalVars.forEach((v) => {
    let rawVal = process.env[v.key];
    if (!rawVal && v.fallbackKey) {
      rawVal = process.env[v.fallbackKey];
    }

    let status = 'PASS';
    let detail = 'Configured successfully.';
    let displayColor = colors.green;

    if (!rawVal) {
      status = 'FAIL';
      detail = 'CRITICAL MISSING VARIABLE!';
      displayColor = colors.red;
      fatalCount++;
    } else {
      if (v.check) {
        const checkResult = v.check(rawVal);
        if (checkResult !== 'OK') {
          status = 'FAIL';
          detail = `CRITICAL CONFIG ERROR: ${checkResult}`;
          displayColor = colors.red;
          fatalCount++;
        }
      }
    }

    const paddedKey = v.key.padEnd(25);
    const badge = `[ ${status} ]`.padEnd(10);
    console.log(`   ${displayColor}${badge}${colors.reset} ${colors.bold}${paddedKey}${colors.reset} - ${v.desc}`);
    console.log(`              ${colors.yellow}⤷ Status: ${detail}${colors.reset}`);
  });

  console.log('');

  // 2. Audit Optional Services (Warning only, never fails boot)
  console.log(`${colors.bold}${colors.blue}[ OPTIONAL RESILIENT SERVICES STATUS ]${colors.reset}`);
  optionalServicesVars.forEach((v) => {
    let rawVal = process.env[v.key];
    if (!rawVal && v.fallbackKey) {
      rawVal = process.env[v.fallbackKey];
    }

    let status = 'PASS';
    let detail = 'Configured successfully.';
    let displayColor = colors.green;

    if (!rawVal) {
      status = 'WARN';
      detail = `[CHAOS][BOOT][DEGRADED MODE] ${v.consequence}`;
      displayColor = colors.yellow;
      warnCount++;
      console.warn(`[CHAOS][BOOT][DEGRADED MODE] ${v.consequence}`);
    }

    const paddedKey = v.key.padEnd(25);
    const badge = `[ ${status} ]`.padEnd(10);
    console.log(`   ${displayColor}${badge}${colors.reset} ${colors.bold}${paddedKey}${colors.reset} - ${v.desc}`);
    console.log(`              ${colors.yellow}⤷ Status: ${detail}${colors.reset}`);
  });

  console.log('');

  // 3. Audit Optional Variables
  console.log(`${colors.bold}${colors.blue}[ OPTIONAL & DEFAULT VARIABLES STATUS ]${colors.reset}`);
  optionalVars.forEach((v) => {
    let rawVal = process.env[v.key];
    if (!rawVal && v.fallbackKey) {
      rawVal = process.env[v.fallbackKey];
    }

    let status = 'PASS';
    let detail = '';
    let displayColor = colors.green;

    if (rawVal === undefined) {
      status = 'DEFAULT';
      detail = `Using default value: "${v.default}"`;
      displayColor = colors.yellow;
      warnCount++;
    } else {
      if (v.check) {
        const checkResult = v.check(rawVal);
        if (checkResult !== 'OK') {
          status = 'WARN';
          detail = `Configuration check: ${checkResult}`;
          displayColor = colors.yellow;
          warnCount++;
        } else {
          detail = `Custom configuration loaded: "${rawVal}"`;
        }
      } else {
        detail = `Custom configuration loaded: "${rawVal}"`;
      }
    }

    const paddedKey = v.key.padEnd(25);
    const badge = `[ ${status} ]`.padEnd(10);
    console.log(`   ${displayColor}${badge}${colors.reset} ${colors.bold}${paddedKey}${colors.reset} - ${v.desc}`);
    console.log(`              ⤷ Info: ${detail}`);
  });

  console.log(`\n${colors.blue}----------------------------------------------------------------------${colors.reset}`);
  console.log(`${colors.bold}PRE-BOOT COMPLIANCE SUMMARY:${colors.reset}`);
  console.log(`   Critical Failures:  ${fatalCount > 0 ? colors.red + fatalCount + colors.reset : colors.green + '0' + colors.reset}`);
  console.log(`   Warnings/Defaults:  ${warnCount > 0 ? colors.yellow + warnCount + colors.reset : colors.green + '0' + colors.reset}`);
  console.log(`${colors.blue}======================================================================${colors.reset}\n`);

  if (fatalCount > 0 && isProdOrStaging && !isChaosMode) {
    console.error(`❌ ${colors.bold}${colors.red}BOOTSTRAP TERMINATED: ${fatalCount} production environment critical compliance failure(s) detected.${colors.reset}`);
    console.error(`   Please address all failing SRE configuration rules listed above before spawning this container.\n`);
    process.exit(1);
  } else if (fatalCount > 0) {
    console.warn(`⚠️  ${colors.bold}${colors.yellow}DEVELOPMENT/CHAOS MODE WARNING: ${fatalCount} compliance failures detected. App will boot but features may fail.${colors.reset}\n`);
  } else {
    console.log(`✅ ${colors.bold}${colors.green}PRE-BOOT COMPLIANCE SUCCESS: Environment is validated and production-ready!${colors.reset}\n`);
  }
}

// Backward compatibility legacy helpers
function validateApiEnv() {
  runPreBootAudit();
  return true;
}

function validateSocketEnv() {
  return true;
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
  runPreBootAudit,
};
