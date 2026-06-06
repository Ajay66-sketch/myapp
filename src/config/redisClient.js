// src/config/redisClient.js
// Production Redis topology client factory (Cluster, Sentinel, and Standalone topologies)

const Redis = require('ioredis');

// Ensure globals exist for deterministic process-level singleton management (Fix 1)
global.__REDIS_CLIENT = global.__REDIS_CLIENT || null;
global.__redisClient = global.__redisClient || null;
global.__REDIS_INIT_IN_PROGRESS = global.__REDIS_INIT_IN_PROGRESS || null;

function normalizeEnvValue(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
    return fallback;
  }
  return trimmed;
}

// Production-safe connection retry strategy with exponential backoff and max limit
const productionRetryStrategy = (times) => {
  const delay = Math.min(times * 200, 10000); // Wait up to 10 seconds between retries
  console.log(`[Redis Client] Connection lost. Attempting retry #${times} in ${delay}ms...`);
  return delay;
};

function createRedisClient(options = {}) {
  console.log(`[Redis Client] Instantiating Redis client using REDIS_URL`);

  const connectionTimeoutOptions = {
    connectTimeout: 10000, // 10s connection timeout
    maxRetriesPerRequest: options.maxRetriesPerRequest !== undefined ? options.maxRetriesPerRequest : null, // Crucial for BullMQ
    retryStrategy: options.retryStrategy || productionRetryStrategy,
  };

  const connectionUrl = normalizeEnvValue(process.env.REDIS_URL, 'redis://localhost:6379');
  return new Redis(connectionUrl, {
    ...connectionTimeoutOptions,
    ...options,
  });
}

/**
 * Return a shared singleton Redis client. Creates the client lazily on first call.
 * Enforces a strict singleton lock.
 */
function getRedisClient(options = {}) {
  // If client exists, reuse ONLY
  if (global.__REDIS_CLIENT) {
    return global.__REDIS_CLIENT;
  }

  // If initialization is already in progress, return the existing promise (not actual client yet but getRedisClient handles it)
  // To avoid recursive issues we track init
  
  // Failover reconnect control: max retry loop = 5
  const failoverRetryStrategy = (times) => {
    if (times > 5) {
      console.error(`[Redis Singleton][FAILOVER] Reconnect attempts exhausted (max 5). Stopping reconnect retry loop to prevent CPU/network spam.`);
      return null; // Stops connection retry loop
    }
    const delay = Math.pow(2, times) * 1000; // 2s, 4s, 8s, 16s, 32s (Attempt 5 is 32s)
    console.log(`[Redis Singleton][FAILOVER] Connection lost. Attempting retry #${times} in ${delay}ms...`);
    return delay;
  };

  try {
    const client = createRedisClient({
      maxRetriesPerRequest: null, // Crucial for BullMQ stability
      retryStrategy: failoverRetryStrategy,
      ...options
    });

    global.__REDIS_CLIENT = client;
    global.__redisClient = client;

    // Attach unified event listeners via the Event Bridge ONCE
    const { initRedisEventBridge } = require('./redisEventBridge');
    initRedisEventBridge(client);

    // Initialize the __REDIS_INIT_IN_PROGRESS promise so async boots can await ready state
    global.__REDIS_INIT_IN_PROGRESS = new Promise((resolve, reject) => {
      if (client.status === 'ready') {
        resolve(client);
      } else {
        client.once('ready', () => resolve(client));
        client.once('error', (err) => reject(err));
      }
    }).finally(() => {
      global.__REDIS_INIT_IN_PROGRESS = null;
    });

  } catch (err) {
    console.error('[Redis Singleton] Failed to initialize Redis singleton:', err.message);
    throw err;
  }

  return global.__REDIS_CLIENT;
}

/**
 * Robust async helper that awaits the Redis connection readiness.
 * Times out after 10 seconds to fail-fast.
 */
async function waitUntilRedisReady() {
  const client = getRedisClient();
  if (client.status === 'ready') {
    return client;
  }
  return new Promise((resolve, reject) => {
    let cleanupRun = false;
    const onReady = () => {
      cleanup();
      resolve(client);
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for Redis ready state (current: ${client.status})`));
    }, 10000); // 10s boot timeout

    function cleanup() {
      if (cleanupRun) return;
      cleanupRun = true;
      clearTimeout(timer);
      client.off('ready', onReady);
      client.off('error', onError);
    }

    client.once('ready', onReady);
    client.once('error', onError);
  });
}

// Caching structure for the secondary Redis subscriber client
let subClientInstance = null;

/**
 * Returns the secondary subscription Redis client connection (process-level cached).
 */
function getRedisSubClient() {
  if (subClientInstance) {
    return subClientInstance;
  }
  subClientInstance = createRedisClient({
    maxRetriesPerRequest: null
  });
  return subClientInstance;
}

module.exports = { createRedisClient, getRedisClient, getRedisSubClient, waitUntilRedisReady };
