// src/middleware/requestMetrics.js
// Custom high-performance Prometheus latency and throughput tracking middleware

const { requestTrackingMiddleware } = require('../metrics/prometheus');

// Preserve backwards-compatibility for getMetricsData helper if needed
const getMetricsData = () => {
  return {
    requestCounts: new Map(),
    requestDurations: new Map()
  };
};

module.exports = {
  requestMetricsMiddleware: requestTrackingMiddleware,
  getMetricsData
};
