// src/metrics/aiMetrics.js
// Lightweight AI telemetry counters for cache and provider latency.

const providerLatencyHistogram = {
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
  counts: {},
  sumSeconds: 0,
  totalCount: 0,
};

let cacheHits = 0;
let cacheMisses = 0;

function recordCacheHit() {
  cacheHits += 1;
}

function recordCacheMiss() {
  cacheMisses += 1;
}

function recordProviderLatency(provider, durationMs) {
  const seconds = Math.max(0, durationMs / 1000);
  providerLatencyHistogram.sumSeconds += seconds;
  providerLatencyHistogram.totalCount += 1;
  const bucket = providerLatencyHistogram.buckets.find((limit) => seconds <= limit) ?? 'inf';
  const label = `${provider}:${bucket}`;
  providerLatencyHistogram.counts[label] = (providerLatencyHistogram.counts[label] || 0) + 1;
}

function getCacheHits() {
  return cacheHits;
}

function getCacheMisses() {
  return cacheMisses;
}

function getCacheHitRatio() {
  const total = cacheHits + cacheMisses;
  return total === 0 ? 0 : Number((cacheHits / total).toFixed(4));
}

function getProviderLatencyMetrics() {
  return {
    buckets: { ...providerLatencyHistogram.counts },
    sumSeconds: providerLatencyHistogram.sumSeconds,
    totalCount: providerLatencyHistogram.totalCount,
  };
}

module.exports = {
  recordCacheHit,
  recordCacheMiss,
  recordProviderLatency,
  getCacheHits,
  getCacheMisses,
  getCacheHitRatio,
  getProviderLatencyMetrics,
};
