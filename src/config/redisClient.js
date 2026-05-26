// src/config/redisClient.js
// Production Redis topology client factory (Cluster, Sentinel, and Standalone topologies)

const Redis = require('ioredis');

function normalizeEnvValue(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === 'undefined' || trimmed.toLowerCase() === 'null') {
    return fallback;
  }
  return trimmed;
}

let _singleton = null;

function createRedisClient(options = {}) {
  const mode = normalizeEnvValue(process.env.REDIS_MODE, 'standalone').toLowerCase();
  console.log(`[Redis Client] Instantiating Redis client in [${mode.toUpperCase()}] mode`);

  if (mode === 'cluster') {
    const rawNodes = normalizeEnvValue(process.env.REDIS_CLUSTER_NODES, 'localhost:6379');
    const nodes = rawNodes.split(',').map((nodeStr) => {
      const [host, port] = nodeStr.split(':');
      return { host: host || 'localhost', port: parseInt(port || '6379', 10) };
    });

    return new Redis.Cluster(nodes, {
      redisOptions: {
        maxRetriesPerRequest: options.maxRetriesPerRequest !== undefined ? options.maxRetriesPerRequest : null,
        enableReadyCheck: true,
        ...options,
      },
    });
  }

  if (mode === 'sentinel') {
    const rawSentinels = normalizeEnvValue(process.env.REDIS_SENTINELS, 'localhost:26379');
    const sentinels = rawSentinels.split(',').map((nodeStr) => {
      const [host, port] = nodeStr.split(':');
      return { host: host || 'localhost', port: parseInt(port || '26379', 10) };
    });
    const masterName = normalizeEnvValue(process.env.REDIS_SENTINEL_MASTER, 'mymaster');

    return new Redis({
      sentinels,
      name: masterName,
      sentinelPassword: normalizeEnvValue(process.env.REDIS_SENTINEL_PASSWORD, undefined),
      password: normalizeEnvValue(process.env.REDIS_PASSWORD, undefined),
      maxRetriesPerRequest: options.maxRetriesPerRequest !== undefined ? options.maxRetriesPerRequest : null,
      ...options,
    });
  }

  const connectionUrl = normalizeEnvValue(process.env.REDIS_URL, undefined);
  if (connectionUrl) {
    return new Redis(connectionUrl, options);
  }

  return new Redis({
    host: normalizeEnvValue(process.env.REDIS_HOST, 'localhost'),
    port: parseInt(normalizeEnvValue(process.env.REDIS_PORT, '6379'), 10),
    password: normalizeEnvValue(process.env.REDIS_PASSWORD, undefined),
    ...options,
  });
}

/**
 * Return a shared singleton Redis client. Creates the client lazily on first call.
 * This prevents modules from instantiating multiple Redis connections.
 */
function getRedisClient(options = {}) {
  if (_singleton && _singleton.status) return _singleton;

  try {
    _singleton = createRedisClient(options);
    // attach a noop error handler to avoid unhandled errors leaking
    _singleton.on('error', () => {});
    return _singleton;
  } catch (err) {
    return null;
  }
}

module.exports = { createRedisClient, getRedisClient };
