// src/routes/metrics.js
// Enterprise-grade Prometheus scraping metrics router

const express = require('express');
const mongoose = require('mongoose');
const { getMetricsData } = require('../middleware/requestMetrics');
const aiMetrics = require('../metrics/aiMetrics');

const router = express.Router();

const { getRedisClient } = require('../config/redisClient');

const getRedisStatus = () => {
  try {
    const redis = getRedisClient();
    return redis && redis.status === 'ready' ? 1 : 0;
  } catch (e) {
    return 0;
  }
};

const getMongoStatus = () => {
  return mongoose.connection.readyState === 1 ? 1 : 0;
};

const getActiveSockets = () => {
  try {
    const presenceService = require('../socket/presence/presenceService');
    return presenceService.onlineUsers ? presenceService.onlineUsers.size : 0;
  } catch (e) {
    return 0;
  }
};

router.get('/metrics', (req, res) => {
  const { requestCounts, requestDurations } = getMetricsData();
  const uptime = process.uptime();
  const rss = process.memoryUsage().rss;
  const activeSockets = getActiveSockets();
  const redisConnected = getRedisStatus();
  const mongoConnected = getMongoStatus();

  let responseText = '';

  // 1. System Info
  responseText += `# HELP process_uptime Uptime of the Node.js process in seconds.\n`;
  responseText += `# TYPE process_uptime gauge\n`;
  responseText += `process_uptime ${uptime}\n\n`;

  responseText += `# HELP process_memory_rss Resident set size in bytes.\n`;
  responseText += `# TYPE process_memory_rss gauge\n`;
  responseText += `process_memory_rss ${rss}\n\n`;

  // 2. Database Health
  responseText += `# HELP database_connected Status of DB connection systems.\n`;
  responseText += `# TYPE database_connected gauge\n`;
  responseText += `database_connected{system="mongodb"} ${mongoConnected}\n`;
  responseText += `database_connected{system="redis"} ${redisConnected}\n\n`;

  // 3. Socket Connections
  responseText += `# HELP socket_connections_active Number of active socket connections.\n`;
  responseText += `# TYPE socket_connections_active gauge\n`;
  responseText += `socket_connections_active ${activeSockets}\n\n`;

  // 4. HTTP Metrics
  responseText += `# HELP http_requests_total Total number of HTTP requests processed.\n`;
  responseText += `# TYPE http_requests_total counter\n`;
  requestCounts.forEach((count, key) => {
    const [method, route, status] = key.split(':');
    responseText += `http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}\n`;
  });
  responseText += `\n`;

  responseText += `# HELP http_request_duration_seconds Summary of request latency in seconds.\n`;
  responseText += `# TYPE http_request_duration_seconds summary\n`;
  requestDurations.forEach((sum, key) => {
    const [method, route, status] = key.split(':');
    const count = requestCounts.get(key) || 0;
    responseText += `http_request_duration_seconds_sum{method="${method}",route="${route}",status="${status}"} ${sum}\n`;
    responseText += `http_request_duration_seconds_count{method="${method}",route="${route}",status="${status}"} ${count}\n`;
  });

  responseText += `\n`;

  // 5. AI Cache and Provider Metrics
  responseText += `# HELP ai_cache_hits_total Total API responses served from AI cache.\n`;
  responseText += `# TYPE ai_cache_hits_total counter\n`;
  responseText += `ai_cache_hits_total ${aiMetrics.getCacheHits()}\n`;

  responseText += `# HELP ai_cache_misses_total Total AI cache misses.\n`;
  responseText += `# TYPE ai_cache_misses_total counter\n`;
  responseText += `ai_cache_misses_total ${aiMetrics.getCacheMisses()}\n`;

  responseText += `# HELP ai_cache_hit_ratio AI cache hit ratio.\n`;
  responseText += `# TYPE ai_cache_hit_ratio gauge\n`;
  responseText += `ai_cache_hit_ratio ${aiMetrics.getCacheHitRatio()}\n`;

  const latencyMetrics = aiMetrics.getProviderLatencyMetrics();
  responseText += `# HELP ai_provider_latency_seconds_sum Total provider latency sum in seconds.\n`;
  responseText += `# TYPE ai_provider_latency_seconds_sum gauge\n`;
  responseText += `ai_provider_latency_seconds_sum ${latencyMetrics.sumSeconds}\n`;
  responseText += `# HELP ai_provider_latency_seconds_count Total number of provider latency observations.\n`;
  responseText += `# TYPE ai_provider_latency_seconds_count counter\n`;
  responseText += `ai_provider_latency_seconds_count ${latencyMetrics.totalCount}\n`;

  responseText += `# HELP ai_provider_latency_seconds_bucket Provider latency histogram buckets in seconds.\n`;
  responseText += `# TYPE ai_provider_latency_seconds_bucket histogram\n`;
  Object.entries(latencyMetrics.buckets).forEach(([label, count]) => {
    const [provider, bucket] = label.split(':');
    responseText += `ai_provider_latency_seconds_bucket{provider="${provider}",le="${bucket}"} ${count}\n`;
  });

  res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
  res.send(responseText);
});

module.exports = router;
