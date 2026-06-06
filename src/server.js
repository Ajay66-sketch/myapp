// src/server.js
// Entry point - sets up Express, Socket.io, and connects to MongoDB

require('./config/envLoader'); // Load environment variables first
require('events').EventEmitter.defaultMaxListeners = 50; // globally harden against MaxListenersExceeded (Fix 5)
require('./config/redis.singleton'); // Pre-register global getRedisSingleton
require('./config/infraState'); // Pre-register global System of Record
const { startInfraReconciler } = require('./config/infraReconciler');
require('./telemetry/tracing'); // Initialize OpenTelemetry before any other imports
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./socket');
const status = require('./config/status');
const { loadVaultSecrets } = require('./config/vault');

const isVercel = Boolean(process.env.VERCEL);

async function validateStartupDependencies() {
  const isProdOrStaging = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  if (!isProdOrStaging) {
    console.log('⚠️ Running in development/testing mode; skipping strict startup dependency validation.');
    return;
  }

  console.log('🔍 [Startup check] Validating production/staging dependencies...');

  // 1. Validate MongoDB
  const mongoHost = await connectDB();
  if (!mongoHost) {
    console.error('❌ [Startup check] MongoDB is required in production/staging but is offline! Boot halted.');
    process.exit(1);
  }
  status.setDatabaseConnected(true, mongoHost);

  // 2. Validate Redis
  const { getRedisSingleton } = require('./config/redis.singleton');
  const redisClient = getRedisSingleton();
  
  if (!redisClient) {
    console.error('❌ [Startup check] Redis client could not be instantiated in production/staging! Boot halted.');
    process.exit(1);
  }

  // Wait up to 5 seconds for Redis to become ready
  const checkRedisReady = () => {
    const systemEventBus = require('./telemetry/eventBus');
    return new Promise((resolve) => {
      if (redisClient.status === 'ready') return resolve(true);
      
      const onReady = () => {
        cleanup();
        resolve(true);
      };
      
      const onError = () => {
        cleanup();
        resolve(false);
      };
      
      const timer = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 5000);
      
      function cleanup() {
        clearTimeout(timer);
        systemEventBus.removeListener('redis:ready', onReady);
        systemEventBus.removeListener('redis:error', onError);
      }
      
      systemEventBus.once('redis:ready', onReady);
      systemEventBus.once('redis:error', onError);
    });
  };

  const redisReady = await checkRedisReady();
  if (!redisReady) {
    console.error(`❌ [Startup check] Redis is required but is offline (current status: ${redisClient.status})! Boot halted.`);
    process.exit(1);
  }

  status.setRedisConnected(true);
  console.log('✅ [Startup check] All production startup dependencies online.');
}

async function startServer() {
  // Load secrets from HashiCorp Vault dynamically at runtime
  await loadVaultSecrets();

  // Start the deterministic State Reconciliation Engine
  startInfraReconciler();

  // Run strict SRE dependency validations
  await validateStartupDependencies();

  // Start billing reconciliation scheduler
  try {
    const { startBillingReconciliationScheduler } = require('./services/billingReconciliation');
    startBillingReconciliationScheduler();
  } catch (err) {
    console.error('Failed to start billing reconciliation scheduler:', err.message);
  }

  const explicitPort = process.env.API_PORT || process.env.BACKEND_PORT;
  const fallbackPort = process.env.PORT && process.env.PORT !== '3000' ? process.env.PORT : undefined;
  const PORT = explicitPort || fallbackPort || 5000;

  if (!explicitPort && process.env.PORT) {
    console.log(
      '   [Notice] ENV PORT is set. Prefer API_PORT or BACKEND_PORT for the backend to avoid conflict with frontend port 3000.'
    );
    if (process.env.PORT === '3000') {
      console.log('   [Notice] PORT=3000 detected; overriding to backend default 5000 for this process.');
    }
  }

  // Bind non-production database connection fallbacks if not already verified
  const isProdOrStaging = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  if (!isProdOrStaging) {
    const hasMongo = Boolean(process.env.MONGODB_URI);
    if (hasMongo) {
      const host = await connectDB().catch(() => null);
      status.setDatabaseConnected(Boolean(host), host);
    } else {
      status.setDatabaseConnected(false);
    }

    const { getRedisSingleton } = require('./config/redis.singleton');
    const redis = getRedisSingleton();
    if (redis) {
      status.setRedisConnected(redis.status === 'ready');
    }
  }

  if (!isVercel) {
    const server = http.createServer(app);

    // Initialize Socket.io on the same HTTP server instance
    initSocket(server);

    const serverInstance = server.listen(PORT, () => {
      const systemStatus = status.getStatus();
      console.log(`🚀 Server running on port ${PORT}`);
      console.log('   Express + Socket.IO attached to same HTTP server');
      console.log(`   Database mode: ${systemStatus.systems.database.mode}`);
      console.log(`   Redis mode: ${systemStatus.systems.redis.enabled ? 'enabled (optional)' : 'disabled'}`);
    });

    // ─── Graceful Shutdown ───────────────────────────────────────────────────────
    const gracefulShutdown = (signal = 'SIGTERM') => {
      console.log(`🛑 Received shutdown signal [${signal}]. Closing HTTP server...`);
      
      serverInstance.close(async () => {
        console.log('HTTP server closed.');
        try {
          const { initiateGracefulShutdown } = require('./core/shutdownManager');
          await initiateGracefulShutdown(signal);
        } catch (err) {
          console.error('Error during shutdownManager sequence:', err);
          process.exit(1);
        }
      });

      // Force close after 10s
      setTimeout(() => {
        console.error('Forcing server down after 10s timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } else {
    console.log('📦 Running in Vercel production mode');
    console.log('   HTTP server creation is disabled. Exporting Express app.');
  }
}

startServer().catch((err) => {
  console.error('[FATAL SERVER BOOTSTRAP FAILURE]:', err);
  process.exit(1);
});

module.exports = app;
