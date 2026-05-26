// src/server.js
// Entry point - sets up Express, Socket.io, and connects to MongoDB

require('./telemetry/tracing'); // Initialize OpenTelemetry before any other imports
require('dotenv').config();
const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { initSocket } = require('./socket');
const status = require('./config/status');
const { loadVaultSecrets } = require('./config/vault');

const isVercel = Boolean(process.env.VERCEL);

async function startServer() {
  // Load secrets from HashiCorp Vault dynamically at runtime
  await loadVaultSecrets();

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

  const hasMongo = Boolean(process.env.MONGO_URI);
  if (hasMongo) {
    connectDB().then((host) => {
      status.setDatabaseConnected(Boolean(host), host);
    }).catch(() => {
      status.setDatabaseConnected(false);
    });
  } else {
    status.setDatabaseConnected(false);
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
    const gracefulShutdown = () => {
      console.log('🛑 Received shutdown signal. Closing server...');
      
      serverInstance.close(async () => {
        console.log('HTTP server closed.');
        
        try {
          const mongoose = require('mongoose');
          if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
            console.log('MongoDB connection closed.');
          }

          // Gracefully shutdown OpenTelemetry SDK
          const sdk = require('./telemetry/tracing');
          await sdk.shutdown();
          console.log('[OTel Tracing] OpenTelemetry SDK terminated.');

          process.exit(0);
        } catch (err) {
          console.error('Error during shutdown:', err);
          process.exit(1);
        }
      });

      // Force close after 10s
      setTimeout(() => {
        console.error('Forcing server down after 10s timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
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
