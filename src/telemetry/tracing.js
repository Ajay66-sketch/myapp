// src/telemetry/tracing.js
// Production-grade OpenTelemetry Distributed Tracing Initialization

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const resources = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Fetch service details
const serviceName = process.env.OTEL_SERVICE_NAME || 'scholar-backend';
const environment = process.env.NODE_ENV || 'production';

// Set up OTLP Exporter pointing to OpenTelemetry Collector or Jaeger's OTLP HTTP receiver (port 4318)
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger-collector.scholar-prod.svc.cluster.local:4318/v1/traces';

console.log(`[OTel Tracing] Initializing tracing for service: ${serviceName} in ${environment} mode`);
console.log(`[OTel Tracing] Exporter endpoint: ${otlpEndpoint}`);

// Build resource safely, maintaining compatibility with OpenTelemetry v1 and v2 API
let resource;
try {
  const resourceAttributes = {
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
  };

  if (typeof resources.resourceFromAttributes === 'function') {
    // OpenTelemetry v2 API pattern
    resource = resources.resourceFromAttributes(resourceAttributes);
  } else if (typeof resources.Resource === 'function') {
    // OpenTelemetry v1 API pattern
    resource = new resources.Resource(resourceAttributes);
  } else {
    // Fallback if neither works
    resource = resources.defaultResource ? resources.defaultResource() : (resources.emptyResource || {});
  }
} catch (resourceError) {
  console.warn('⚠️ [OTel Tracing] Error initializing telemetry resource safely, falling back:', resourceError.message);
  resource = {};
}

let sdk;
try {
  const traceExporter = new OTLPTraceExporter({
    url: otlpEndpoint,
  });

  sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-express': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-http': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-mongoose': {
          enabled: true,
        },
        '@opentelemetry/instrumentation-ioredis': {
          enabled: true,
        },
      }),
    ],
  });

  // Start the SDK
  sdk.start();
  console.log('🚀 [OTel Tracing] OpenTelemetry SDK started successfully.');
} catch (error) {
  console.error('❌ [OTel Tracing] Error initializing or starting OpenTelemetry SDK. Tracing is disabled, but startup will continue.', error);
  // Provide dummy/fallback sdk object to prevent server crash during shutdown sequence
  sdk = {
    start: () => {},
    shutdown: () => Promise.resolve(),
  };
}

module.exports = sdk;
