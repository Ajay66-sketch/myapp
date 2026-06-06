// src/config/infraReconciler.js
// SRE-grade Deterministic Infrastructure Self-Healing Orchestrator.
// Executes active continuous reconciliation loops to guarantee high availability and zero silent failures.

require('./infraState'); // Ensure state is initialized
const systemEventBus = require('../telemetry/eventBus');
const { updateServiceState } = require('./serviceRegistry');
const status = require('./status');

let reconcilerStarted = false;

function applyRedisState(newStatus) {
  const registryState = (newStatus === 'UP' || newStatus === 'READY') ? 'UP' : (newStatus === 'DEGRADED' ? 'DEGRADED' : 'DOWN');
  updateServiceState('redis', registryState);
  status.setRedisConnected(registryState === 'UP');
}

// Global event bus listeners for SRE-grade single-writer state updates
systemEventBus.on('infra:redis:state', (event) => {
  const { status: newStatus } = event.payload || {};
  if (!newStatus) return;

  if (reconcilerStarted && (newStatus === 'DOWN' || newStatus === 'DEGRADED')) {
    checkRedisHealth().then((actualHealth) => {
      if (actualHealth === 'READY') {
        console.log(`[CHAOS][RECONCILER] Suppressing transient Redis transition to ${newStatus} since actual health is READY.`);
        return;
      }
      applyRedisState(newStatus);
    }).catch(() => {
      applyRedisState(newStatus);
    });
  } else {
    applyRedisState(newStatus);
  }
});

systemEventBus.on('infra:queue:state', (event) => {
  const { status: newStatus } = event.payload || {};
  if (newStatus) {
    updateServiceState('queue', newStatus);
  }
});

systemEventBus.on('infra:billing:state', (event) => {
  const { status: newStatus } = event.payload || {};
  if (newStatus) {
    updateServiceState('billing', newStatus);
  }
});

systemEventBus.on('infra:service:state', (event) => {
  const { service, status: newStatus } = event.payload || {};
  if (service && newStatus) {
    updateServiceState(service, newStatus);
  }
});

/**
 * Perform health validation on the singleton Redis connection.
 */
async function checkRedisHealth() {
  const { getRedisClient } = require('./redisClient');
  const redisClient = getRedisClient();
  if (!redisClient) return 'DOWN';

  if (redisClient.status === 'ready') {
    try {
      // Ping check with 2s timeout
      const pong = await Promise.race([
        redisClient.ping(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Ping timeout')), 2000))
      ]);
      if (pong === 'PONG') {
        return 'READY';
      }
    } catch (err) {
      console.error(`[CHAOS][RECONCILER] Redis ping health check failed: ${err.message}`);
    }
  }

  if (redisClient.status === 'connecting' || redisClient.status === 'reconnecting') {
    return 'DEGRADED';
  }

  return 'DOWN';
}

/**
 * Actively reconcile actual infrastructure states against global.__INFRA_STATE and correct mismatches immediately.
 */
async function runReconciliation() {
  const state = global.__INFRA_STATE;
  state.queue.lastCheck = Date.now();

  const redisActual = await checkRedisHealth();

  // If actual is DOWN but the last heartbeat was successful within 10s, preserve READY status
  const heartbeatAge = Date.now() - state.redis.lastHeartbeat;
  let computedStatus = redisActual;
  if (computedStatus === 'DOWN' && state.redis.status === 'READY' && heartbeatAge <= 10000) {
    computedStatus = 'READY';
  }

  // 1. Correct Redis state mismatches
  if (state.redis.status !== computedStatus) {
    console.warn(`[CHAOS][RECONCILER] Redis status mismatch. Recorded: ${state.redis.status}, Actual: ${computedStatus}. Adjusting...`);
    state.redis.status = computedStatus;
    state.redis.version++;

    const registryState = computedStatus === 'READY' ? 'UP' : (computedStatus === 'DEGRADED' ? 'DEGRADED' : 'DOWN');
    updateServiceState('redis', registryState);
    status.setRedisConnected(computedStatus === 'READY');
  }

  // 2. Correct Queue state mismatches
  const expectedQueueStatus = state.redis.status === 'READY' ? 'ACTIVE' : 'DEGRADED';
  if (state.queue.status !== expectedQueueStatus) {
    console.warn(`[CHAOS][RECONCILER] Queue status mismatch. Recorded: ${state.queue.status}, Expected: ${expectedQueueStatus}. Aligning queues...`);
    state.queue.status = expectedQueueStatus;
    updateServiceState('queue', expectedQueueStatus === 'ACTIVE' ? 'ACTIVE' : 'DEGRADED');
  }

  // 3. STATE ALWAYS OVERRIDES EVENTS: Actively force target state on all instantiated queues
  for (const q of (global.__allQueues || [])) {
    if (state.redis.status === 'READY') {
      q.ensureQueueActive();
    } else {
      q.enterDegradedMode();
    }
  }

  // 4. Update connection metrics
  let activeConnections = 0;
  for (const q of (global.__allQueues || [])) {
    if (q.isBullMqActive) activeConnections++;
  }
  activeConnections += global.__WORKER_REGISTRY ? global.__WORKER_REGISTRY.size : 0;
  state.queue.activeConnections = activeConnections;
}

/**
 * 3-second Heartbeat loop to keep state fresh and trigger rapid recovery if needed.
 */
function startHeartbeatLoop() {
  setInterval(async () => {
    const { getRedisClient } = require('./redisClient');
    const redisClient = getRedisClient();
    if (redisClient) {
      try {
        const pong = await Promise.race([
          redisClient.ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Heartbeat ping timeout')), 2000))
        ]);
        if (pong === 'PONG') {
          global.__INFRA_STATE.redis.lastHeartbeat = Date.now();
          if (global.__INFRA_STATE.redis.status !== 'READY') {
            global.__INFRA_STATE.redis.status = 'READY';
            global.__INFRA_STATE.redis.version++;
            console.log(`[CHAOS][HEARTBEAT] Redis connected. Status converged to READY (v${global.__INFRA_STATE.redis.version})`);
            runReconciliation().catch(() => {});
          }
        }
      } catch (err) {
        console.error(`[CHAOS][HEARTBEAT] Redis heartbeat ping error: ${err.message}`);
      }
    }

    const age = Date.now() - global.__INFRA_STATE.redis.lastHeartbeat;
    if (age > 10000 && global.__INFRA_STATE.redis.status === 'READY') {
      global.__INFRA_STATE.redis.status = 'DOWN';
      global.__INFRA_STATE.redis.version++;
      console.error(`[CHAOS][HEARTBEAT] Redis heartbeat expired (${Math.round(age / 1000)}s old). Status marked DOWN (v${global.__INFRA_STATE.redis.version})`);
      runReconciliation().catch(() => {});
    }
  }, 3000);
}

/**
 * 5-second Watchdog per queue to protect against silent BullMQ connections dying.
 */
function startWatchdogLoop() {
  setInterval(async () => {
    if (global.__INFRA_STATE.redis.status !== 'READY') return;

    for (const q of (global.__allQueues || [])) {
      const { getRedisClient } = require('./redisClient');
      const redisClient = getRedisClient();
      if (!redisClient || redisClient.status !== 'ready') {
        await q.recreateBullQueue();
        continue;
      }

      try {
        if (!q.bullQueue) {
          await q.recreateBullQueue();
          continue;
        }

        // Responsive test
        const counts = await Promise.race([
          q.bullQueue.getJobCounts(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Watchdog job counts timeout')), 2000))
        ]);

        const activeAndWaiting = (counts.active || 0) + (counts.waiting || 0);
        if (activeAndWaiting === 0) {
          // Valid idle state
          q._lastCompletedFailedCount = (counts.completed || 0) + (counts.failed || 0);
          q._lastCheckTime = Date.now();
        } else {
          // Check throughput
          const totalProcessed = (counts.completed || 0) + (counts.failed || 0);
          const lastProcessed = q._lastCompletedFailedCount || 0;

          if (totalProcessed > lastProcessed) {
            q._lastCompletedFailedCount = totalProcessed;
            q._lastCheckTime = Date.now();
          } else {
            const timeSinceProgress = Date.now() - (q._lastCheckTime || Date.now());
            if (timeSinceProgress > 20000) {
              console.warn(`[CHAOS][AUTO-RECOVERY] Silent queue stall detected on "${q.name}" (no throughput for 20s with pending jobs). Recreating...`);
              await q.recreateBullQueue();
              q._lastCheckTime = Date.now();
            }
          }
        }
      } catch (err) {
        console.error(`[CHAOS][AUTO-RECOVERY] Watchdog liveness check failed for "${q.name}": ${err.message}`);
        await q.recreateBullQueue();
      }
    }
  }, 5000);
}

/**
 * Recreate a stale background worker in-process.
 */
async function recreateWorker(workerEntry) {
  console.warn(`[CHAOS][AUTO-RECOVERY] Recreating worker for queue: "${workerEntry.queueName}"...`);
  try {
    await workerEntry.workerInstance.close().catch(() => {});
    
    const queue = (global.__allQueues || []).find(q => q.name === workerEntry.queueName);
    if (queue) {
      queue.createWorker({
        concurrency: workerEntry.concurrency,
        timeoutMs: workerEntry.staleThresholdMs
      });
      console.log(`[CHAOS][AUTO-RECOVERY] Successfully restarted worker for queue: "${workerEntry.queueName}"`);
    }
  } catch (err) {
    console.error(`[CHAOS][ERROR][AUTO-RECOVERY] Failed to recreate worker for "${workerEntry.queueName}":`, err.message);
  }
}

/**
 * 5-second Background Worker Registry Liveness check.
 */
function startWorkerRegistryLoop() {
  setInterval(async () => {
    global.__WORKER_REGISTRY = global.__WORKER_REGISTRY || new Map();

    for (const [workerId, entry] of global.__WORKER_REGISTRY.entries()) {
      const queue = (global.__allQueues || []).find(q => q.name === entry.queueName);
      if (!queue || !queue.bullQueue) continue;

      try {
        const counts = await queue.bullQueue.getJobCounts();
        const activeAndWaiting = (counts.active || 0) + (counts.waiting || 0);

        if (activeAndWaiting > 0) {
          const age = Date.now() - entry.lastProcessedAt;
          if (age > entry.staleThresholdMs) {
            console.error(`[CHAOS][WORKER] Worker "${workerId}" is STALE (no processing for ${Math.round(age / 1000)}s with pending backlog). Restarting...`);
            systemEventBus.emit('worker:stale', 'error', { queue: entry.queueName, workerId });

            global.__WORKER_REGISTRY.delete(workerId);
            await recreateWorker(entry);
          }
        } else {
          // Keep fresh when queue is completely empty
          entry.lastProcessedAt = Date.now();
        }
      } catch (err) {
        console.error(`[CHAOS][WORKER] Liveness check error for worker "${workerId}": ${err.message}`);
      }
    }
  }, 5000);
}

/**
 * Start the global Infrastructure Reconciliation System.
 */
async function startInfraReconciler() {
  if (reconcilerStarted) return;
  reconcilerStarted = true;

  console.log('🔄 [CHAOS][RECONCILER] Preparing to start State Reconciliation Loop...');

  try {
    const { waitUntilRedisReady } = require('./redisClient');
    // 1. WAIT FOR REDIS READY
    await waitUntilRedisReady();
    console.log('✅ [CHAOS][RECONCILER] Redis ready state established. Initializing Reconciler.');

    // 2. Populate InfraState
    const state = global.__INFRA_STATE;
    state.redis.status = "READY";
    state.redis.lastHeartbeat = Date.now();
    state.redis.version = 1;
    state.queue.status = "ACTIVE";
    state.queue.lastCheck = Date.now();

    // Update registry and status module states
    updateServiceState('redis', 'UP');
    status.setRedisConnected(true);
    updateServiceState('queue', 'ACTIVE');

    // 3. Start Heartbeat
    startHeartbeatLoop();

    // 4. Start Reconciliation Loop
    await runReconciliation().catch((err) => {
      console.error('[CHAOS][RECONCILER] Initial reconciliation failed:', err.message);
    });

    setInterval(async () => {
      try {
        await runReconciliation();
      } catch (err) {
        console.error('[CHAOS][RECONCILER] Error in reconciliation loop:', err.message);
      }
    }, 3000);

    // 5. Start Queue Watchdogs (watchdog and worker registry loops)
    startWatchdogLoop();
    startWorkerRegistryLoop();

    console.log('🔄 [CHAOS][RECONCILER] State Reconciliation Engine fully active in READY mode.');
  } catch (err) {
    console.error('❌ [CHAOS][RECONCILER] Failed to start InfraReconciler due to Redis failure:', err.message);
    // Do NOT start loop, keep in degraded/failed state
    const state = global.__INFRA_STATE;
    state.redis.status = "DOWN";
    state.queue.status = "DISABLED";
    updateServiceState('redis', 'DOWN');
    updateServiceState('queue', 'DEGRADED');
    status.setRedisConnected(false);
    throw err;
  }
}

module.exports = {
  startInfraReconciler,
  runReconciliation
};
