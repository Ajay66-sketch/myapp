// src/telemetry/tracing.js
// Production-grade OpenTelemetry Distributed Tracing Initialization

const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');
const { Resource } = require('@opentelemetry/resources');
const { SemanticResourceAttributes } = require('@opentelemetry/semantic-conventions');

// Fetch service details
const serviceName = process.env.OTEL_SERVICE_NAME || 'scholar-backend';
const environment = process.env.NODE_ENV || 'production';

// Set up OTLP Exporter pointing to OpenTelemetry Collector or Jaeger's OTLP HTTP receiver (port 4318)
const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://jaeger-collector.scholar-prod.svc.cluster.local:4318/v1/traces';

console.log(`[OTel Tracing] Initializing tracing for service: ${serviceName} in ${environment} mode`);
console.log(`[OTel Tracing] Exporter endpoint: ${otlpEndpoint}`);

const traceExporter = new OTLPTraceExporter({
  url: otlpEndpoint,
});

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: environment,
  }),
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
try {
  sdk.start();
  console.log('🚀 [OTel Tracing] OpenTelemetry SDK started successfully.');
} catch (error) {
  console.error('❌ [OTel Tracing] Error starting OpenTelemetry SDK:', error);
}

module.exports = sdk;
