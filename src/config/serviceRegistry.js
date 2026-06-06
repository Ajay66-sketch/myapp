// src/config/serviceRegistry.js
// SRE-grade Service State Registry for chaos-safe runtime resilience

const systemState = {
  redis: 'DOWN',   // UP | DOWN | DEGRADED
  billing: 'DOWN', // UP | DOWN | DEGRADED
  queue: 'OFFLINE' // ACTIVE | PAUSED | OFFLINE | DEGRADED
};

// Track SRE metrics
const metrics = {
  redis_status: 'DOWN',
  billing_status: 'DOWN',
  queue_mode: 'NORMAL',
  queue_pressure: '0%',
  rejected_requests_count: 0,
  idempotency_blocks_count: 0
};

function getSystemState() {
  return systemState;
}

function getMetrics() {
  metrics.redis_status = systemState.redis;
  metrics.billing_status = systemState.billing;

  let pendingCount = 0;
  if (global.__allQueues && Array.isArray(global.__allQueues)) {
    for (const q of global.__allQueues) {
      if (q) {
        pendingCount += q.pendingRequestsCount || 0;
      }
    }
  }

  const MAX_QUEUE_LIMIT = 1000;
  let queueMode = 'NORMAL';
  if (systemState.redis === 'DOWN' || systemState.redis === 'DEGRADED') {
    if (pendingCount >= MAX_QUEUE_LIMIT) {
      queueMode = 'THROTTLED';
    } else {
      queueMode = 'DEGRADED';
    }
  }

  metrics.queue_mode = queueMode;
  metrics.queue_pressure = `${Math.min(100, Math.round((pendingCount / MAX_QUEUE_LIMIT) * 100))}%`;
  metrics.rejected_requests_count = global.__rejectedJobsCount || 0;
  metrics.idempotency_blocks_count = global.__idempotencyHits || 0;

  // Expose ONLY deterministic runtime state
  return {
    redis_status: metrics.redis_status,
    billing_status: metrics.billing_status,
    queue_mode: metrics.queue_mode,
    queue_pressure: metrics.queue_pressure,
    rejected_requests_count: metrics.rejected_requests_count,
    idempotency_blocks_count: metrics.idempotency_blocks_count
  };
}

function updateServiceState(service, state) {
  if (systemState[service] !== undefined) {
    const oldState = systemState[service];
    systemState[service] = state;
    metrics[`${service}_status`] = state;
    
    if (oldState !== state) {
      console.log(`[CHAOS][SERVICE][STATE_CHANGE] ${service} changed from ${oldState} to ${state}`);
      if (state === 'DEGRADED') {
        console.warn(`[CHAOS][DEGRADED MODE] ${service} unavailable → operating in degraded mode`);
      }
    }
  }
}

module.exports = {
  systemState,
  metrics,
  getSystemState,
  getMetrics,
  updateServiceState
};
