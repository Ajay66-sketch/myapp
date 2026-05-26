// src/middleware/requestMetrics.js
// Custom high-performance Prometheus latency and throughput tracking middleware

const requestCounts = new Map(); // key: "method:route:status" -> count
const requestDurations = new Map(); // key: "method:route:status" -> sum of seconds

const recordRequest = (method, route, status, durationSec) => {
  const key = `${method}:${route}:${status}`;
  requestCounts.set(key, (requestCounts.get(key) || 0) + 1);
  requestDurations.set(key, (requestDurations.get(key) || 0) + durationSec);
};

const getMetricsData = () => {
  return {
    requestCounts,
    requestDurations
  };
};

const requestMetricsMiddleware = (req, res, next) => {
  const start = process.hrtime();
  
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationSec = diff[0] + diff[1] / 1e9;
    
    // Normalize route path to prevent high cardinality explosions on dynamic IDs
    let route = req.route ? req.route.path : req.path;
    if (route !== '/' && route.endsWith('/')) {
      route = route.slice(0, -1);
    }
    
    recordRequest(req.method, route, res.statusCode, durationSec);
  });
  
  next();
};

module.exports = {
  requestMetricsMiddleware,
  getMetricsData
};
