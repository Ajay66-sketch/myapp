// src/queue/posthogQueue.js
// SRE-grade resilient background processing queue for PostHog event ingestion
// Offloads heavy HTTP operations from the main API loop with offline buffering support

const https = require('https');
const url = require('url');
const ResilientQueue = require('./baseQueue');
const systemEventBus = require('../telemetry/eventBus');

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || '';
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';

/**
 * Dispatch batch events to PostHog API natively via HTTPS POST
 */
function sendBatchToPostHog(batchEvents) {
  return new Promise((resolve, reject) => {
    if (!POSTHOG_API_KEY) {
      console.log(`[PostHog Mock Ingest] Api Key missing. Batch of ${batchEvents.length} events logged to console:`, JSON.stringify(batchEvents, null, 2));
      return resolve({ success: true, mock: true });
    }

    const payload = JSON.stringify({
      api_key: POSTHOG_API_KEY,
      batch: batchEvents
    });

    const parsedUrl = url.parse(`${POSTHOG_HOST}/batch/`);
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 10000 // 10 seconds SRE gateway timeout
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ success: true, statusCode: res.statusCode, body: data });
        } else {
          reject(new Error(`PostHog API Error: HTTP ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('PostHog API Request Timeout'));
    });

    req.write(payload);
    req.end();
  });
}

// Instantiate the resilient PostHog events processing queue
const posthogQueue = new ResilientQueue('posthog-events', async (jobData) => {
  const { eventName, distinctId, properties, timestamp } = jobData;

  // Build PostHog formatted event object
  const postHogEventObj = {
    event: eventName,
    properties: {
      distinct_id: distinctId,
      ...properties
    },
    timestamp: timestamp || new Date().toISOString()
  };

  try {
    // Pipeline single job payloads as a batch request to allow future batch optimizations
    const result = await sendBatchToPostHog([postHogEventObj]);
    systemEventBus.emit('posthog:dispatch_success', 'info', { event: eventName, distinctId, mock: !!result.mock }, distinctId);
  } catch (err) {
    systemEventBus.emit('posthog:dispatch_failed', 'error', { event: eventName, distinctId, error: err.message }, distinctId);
    throw err; // Re-throw to allow ResilientQueue automatic retry/backoff mechanism
  }
});

module.exports = posthogQueue;
