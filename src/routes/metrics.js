// src/routes/metrics.js
// Enterprise-grade Prometheus scraping metrics router using prom-client

const express = require('express');
const mongoose = require('mongoose');
const prometheus = require('../metrics/prometheus');
const aiMetrics = require('../metrics/aiMetrics');
const { getRedisClient } = require('../config/redisClient');

const router = express.Router();

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

router.get('/metrics', async (req, res) => {
  try {
    // Dynamically update gauges just before rendering
    prometheus.websocketConnectionsActive.set(getActiveSockets());
    
    const redisVal = getRedisStatus();
    const mongoVal = getMongoStatus();
    
    // Set Database connection gauges
    let dbGauge = prometheus.register.getSingleMetric('database_connected');
    if (!dbGauge) {
      dbGauge = new (require('prom-client').Gauge)({
        name: 'database_connected',
        help: 'Status of DB connection systems.',
        labelNames: ['system'],
        registers: [prometheus.register]
      });
    }
    dbGauge.set({ system: 'mongodb' }, mongoVal);
    dbGauge.set({ system: 'redis' }, redisVal);

    // Set AI Cache stats
    let cacheHitsGauge = prometheus.register.getSingleMetric('ai_cache_hits_total');
    if (!cacheHitsGauge) {
      cacheHitsGauge = new (require('prom-client').Gauge)({
        name: 'ai_cache_hits_total',
        help: 'Total API responses served from AI cache.',
        registers: [prometheus.register]
      });
    }
    cacheHitsGauge.set(aiMetrics.getCacheHits ? aiMetrics.getCacheHits() : 0);

    let cacheMissesGauge = prometheus.register.getSingleMetric('ai_cache_misses_total');
    if (!cacheMissesGauge) {
      cacheMissesGauge = new (require('prom-client').Gauge)({
        name: 'ai_cache_misses_total',
        help: 'Total AI cache misses.',
        registers: [prometheus.register]
      });
    }
    cacheMissesGauge.set(aiMetrics.getCacheMisses ? aiMetrics.getCacheMisses() : 0);

    let cacheRatioGauge = prometheus.register.getSingleMetric('ai_cache_hit_ratio');
    if (!cacheRatioGauge) {
      cacheRatioGauge = new (require('prom-client').Gauge)({
        name: 'ai_cache_hit_ratio',
        help: 'AI cache hit ratio.',
        registers: [prometheus.register]
      });
    }
    cacheRatioGauge.set(aiMetrics.getCacheHitRatio ? aiMetrics.getCacheHitRatio() : 0);

    res.set('Content-Type', prometheus.register.contentType);
    res.send(await prometheus.register.metrics());
  } catch (err) {
    res.status(500).end(err.message);
  }
});

module.exports = router;
