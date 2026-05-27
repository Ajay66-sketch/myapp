// src/workers/index.js
// SRE-grade central Worker Bootstrap Orchestrator for real-time background task processing
// Supports running all queues simultaneously or starting targeted workers via --queue or QUEUE_NAME for independent scaling.

require('../telemetry/tracing'); // OTel Tracing
require('dotenv').config();
const connectDB = require('../config/db');
const { loadVaultSecrets } = require('../config/vault');

// Import all application queues
const { aiQueue } = require('../queue/aiQueue');
const notificationQueue = require('../queue/notificationQueue');
const aiTutorQueue = require('../queue/aiTutorQueue');
const analyticsQueue = require('../queue/analyticsQueue');
const telemetryQueue = require('../queue/telemetryQueue');
const posthogQueue = require('../queue/posthogQueue');
const pdfQueue = require('../queue/pdfQueue');

const activeWorkers = [];

async function bootstrapWorkers() {
  console.log('🏁 Central worker bootstrap process starting...');
  
  // 1. Load HashiCorp Vault secrets dynamically
  await loadVaultSecrets();

  // 2. Establish MongoDB Connection
  await connectDB();

  // 3. Determine which queues to spin up in this process
  // Supports argument flag: --queue=ai-coach or environment variable: QUEUE_NAME=ai-coach
  const argQueue = process.argv.find(arg => arg.startsWith('--queue='))?.split('=')[1];
  const targetQueueName = process.env.QUEUE_NAME || argQueue;

  const queueMap = {
    'ai-coach': {
      queue: aiQueue,
      options: { concurrency: process.env.AI_WORKER_CONCURRENCY ? parseInt(process.env.AI_WORKER_CONCURRENCY) : 2, timeoutMs: 90000 }
    },
    'system-notifications': {
      queue: notificationQueue,
      options: { concurrency: process.env.NOTIFICATION_WORKER_CONCURRENCY ? parseInt(process.env.NOTIFICATION_WORKER_CONCURRENCY) : 5, timeoutMs: 15000 }
    },
    'ai-tutor-milestones': {
      queue: aiTutorQueue,
      options: { concurrency: process.env.TUTOR_WORKER_CONCURRENCY ? parseInt(process.env.TUTOR_WORKER_CONCURRENCY) : 10, timeoutMs: 15000 }
    },
    'study-analytics': {
      queue: analyticsQueue,
      options: { concurrency: process.env.ANALYTICS_WORKER_CONCURRENCY ? parseInt(process.env.ANALYTICS_WORKER_CONCURRENCY) : 5, timeoutMs: 20000 }
    },
    'telemetry-logs': {
      queue: telemetryQueue,
      options: { concurrency: process.env.TELEMETRY_WORKER_CONCURRENCY ? parseInt(process.env.TELEMETRY_WORKER_CONCURRENCY) : 5, timeoutMs: 10000 }
    },
    'posthog-events': {
      queue: posthogQueue,
      options: { concurrency: process.env.POSTHOG_WORKER_CONCURRENCY ? parseInt(process.env.POSTHOG_WORKER_CONCURRENCY) : 10, timeoutMs: 15000 }
    },
    'pdf-processing': {
      queue: pdfQueue,
      options: { concurrency: 2, timeoutMs: 90000 }
    }
  };

  if (targetQueueName) {
    // Targeted Worker Scaling Mode (Kubernetes / Docker Pods)
    const target = queueMap[targetQueueName];
    if (!target) {
      console.error(`❌ Unknown worker queue target: "${targetQueueName}". Supported queues: [${Object.keys(queueMap).join(', ')}]`);
      process.exit(1);
    }
    
    console.log(`🎯 Targeted Worker Mode: Bootstrapping ONLY "${targetQueueName}" consumer.`);
    const workerInstance = target.queue.createWorker(target.options);
    activeWorkers.push(workerInstance);
  } else {
    // Multi-Core Monolith Mode: Bootstrap all workers in the current runtime process
    console.log('🌐 Multi-Queue Mode: Bootstrapping ALL consumers in a single process.');
    for (const [name, target] of Object.entries(queueMap)) {
      const workerInstance = target.queue.createWorker(target.options);
      activeWorkers.push(workerInstance);
    }
  }

  console.log(`🚀 ${activeWorkers.length} background worker(s) online and processing jobs.`);

  // ─── 4. Graceful Shutdown Handlers ──────────────────────────────────────────
  const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}. Starting SRE-grade graceful shutdown sequence...`);
    
    // Stop accepting new jobs and wait for existing jobs to complete
    console.log(`👷 Draining ${activeWorkers.length} active worker consumers...`);
    const closePromises = activeWorkers.map(w => w.close());
    
    // 5 seconds max grace time to drain
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Grace period timed out')), 5000));
    
    try {
      await Promise.race([
        Promise.all(closePromises),
        timeoutPromise
      ]);
      console.log('✅ All background jobs finished processing and workers drained successfully.');
    } catch (err) {
      console.warn('⚠️ Grace period timed out or failed while draining jobs. Forcing termination...', err.message);
    }

    // Safely disconnect database
    try {
      const mongoose = require('mongoose');
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        console.log('MongoDB connection closed.');
      }
      
      // Shutdown OpenTelemetry
      const sdk = require('../telemetry/tracing');
      await sdk.shutdown();
      console.log('[OTel Tracing] OpenTelemetry SDK terminated.');
    } catch (dbErr) {
      console.error('Error closing resources:', dbErr.message);
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}

bootstrapWorkers().catch((err) => {
  console.error('[FATAL WORKER BOOTSTRAP EXCEPTION]:', err);
  process.exit(1);
});
