// src/metrics/prometheus.js
// Production-grade Prometheus Metrics Collector and Exporter using prom-client

const client = require('prom-client');

// Initialize default node system metrics (CPU, Memory, Event loop lag, etc.)
client.collectDefaultMetrics({ register: client.register });

// ─── 1. HTTP Metrics ──────────────────────────────────────────────────────────
const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests processed',
  labelNames: ['method', 'route', 'status']
});

const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10]
});

// ─── 2. WebSocket Metrics ─────────────────────────────────────────────────────
const websocketConnectionsActive = new client.Gauge({
  name: 'websocket_connections_active',
  help: 'Active WebSocket client connections'
});

const websocketEventsTotal = new client.Counter({
  name: 'websocket_events_total',
  help: 'Total WebSocket events processed',
  labelNames: ['event', 'direction'] // direction: incoming | outgoing
});

// ─── 3. AI Provider Metrics ───────────────────────────────────────────────────
const aiProviderRequestsTotal = new client.Counter({
  name: 'ai_provider_requests_total',
  help: 'Total AI provider queries executed',
  labelNames: ['provider', 'model', 'status'] // status: success | failure
});

const aiProviderLatency = new client.Histogram({
  name: 'ai_provider_latency_seconds',
  help: 'AI completion response latency in seconds',
  labelNames: ['provider', 'model'],
  buckets: [0.2, 0.5, 1, 2, 5, 10, 20, 30]
});

// ─── 4. Queue / BullMQ Metrics ───────────────────────────────────────────────
const queueJobsTotal = new client.Counter({
  name: 'queue_jobs_total',
  help: 'Total number of background queue jobs completed or failed',
  labelNames: ['queue', 'status'] // status: completed | failed | dlq
});

// ─── 5. Circuit Breaker Metrics ───────────────────────────────────────────────
const circuitBreakerState = new client.Gauge({
  name: 'circuit_breaker_state',
  help: 'State of LLM circuit breakers (0 = CLOSED, 1 = HALF_OPEN, 2 = OPEN)',
  labelNames: ['service']
});

/**
 * Express middleware to automatically track request counts and latencies
 */
function requestTrackingMiddleware(req, res, next) {
  const start = process.hrtime();
  
  res.on('finish', () => {
    const diff = process.hrtime(start);
    const durationInSeconds = diff[0] + diff[1] / 1e9;
    
    // Normalize path to avoid high-cardinality label pollution (e.g. users ID/UUID paths)
    let route = req.route ? req.route.path : req.path;
    
    // Clean up typical dynamic UUID/ID routes if needed
    if (route) {
      route = route.replace(/\/[0-9a-fA-F]{24}/g, '/:id');
    } else {
      route = 'unknown';
    }

    const labels = {
      method: req.method,
      route,
      status: res.statusCode
    };

    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe(labels, durationInSeconds);
  });

  next();
}

// Wire event bus listeners to update circuitBreakerState gauge automatically
const systemEventBus = require('../telemetry/eventBus');

systemEventBus.on('circuit:closed', (event) => {
  if (event.payload && event.payload.service) {
    circuitBreakerState.set({ service: event.payload.service }, 0);
  }
});
systemEventBus.on('circuit:half_open', (event) => {
  if (event.payload && event.payload.service) {
    circuitBreakerState.set({ service: event.payload.service }, 1);
  }
});
systemEventBus.on('circuit:open', (event) => {
  if (event.payload && event.payload.service) {
    circuitBreakerState.set({ service: event.payload.service }, 2);
  }
});

module.exports = {
  register: client.register,
  httpRequestsTotal,
  httpRequestDuration,
  websocketConnectionsActive,
  websocketEventsTotal,
  aiProviderRequestsTotal,
  aiProviderLatency,
  queueJobsTotal,
  circuitBreakerState,
  requestTrackingMiddleware
};
