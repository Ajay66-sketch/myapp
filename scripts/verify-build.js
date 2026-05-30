// scripts/verify-build.js
// Production build smoke test and endpoint compiler verification
// Boots server on a temporary test port, runs HTTP tests, verifies outputs, and shuts down cleanly

const http = require('http');
const path = require('path');

// Mock necessary env vars to avoid crash in development/CI environments
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'ci-verification-unsafe-jwt-secret-antigravity';
process.env.DISABLE_CSRF = 'true'; // Allow bypass for CI smoke testing
process.env.MONGO_URI = 'mongodb://localhost:27017/ci-test-db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.CLIENT_URL = 'http://localhost:3000';

// Mock Stripe secrets for production pre-boot validation checks
process.env.STRIPE_API_KEY = 'sk_test_verify_build_mock_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_verify_build_mock_key';
process.env.STRIPE_MONTHLY_PRICE_ID = 'price_monthly_verify_build_mock';
process.env.STRIPE_YEARLY_PRICE_ID = 'price_yearly_verify_build_mock';

// Mock PostHog secrets for production pre-boot validation checks
process.env.POSTHOG_API_KEY = 'phc_test_verify_build_mock_key';
process.env.POSTHOG_HOST = 'https://app.posthog.com';

// Mock OpenAI API key for production pre-boot validation checks
process.env.OPENAI_API_KEY = 'sk_mock_openai_key_for_ci_verification';

console.log('🏁 Initiating production compiler smoke verification checks...');

try {
  // 1. Verify app compiles and loads without throwing exceptions
  const app = require('../src/app');
  const server = http.createServer(app);
  
  const TEST_PORT = process.env.TEST_PORT || 5099;
  
  // 2. Start server on local test port
  server.listen(TEST_PORT, () => {
    console.log(`🚀 Smoke Server successfully booted on temporary test port ${TEST_PORT}`);
    
    // 3. Query the live health check endpoint
    const requestOptions = {
      host: 'localhost',
      port: TEST_PORT,
      path: '/api/health',
      method: 'GET',
      timeout: 3000
    };
    
    console.log(`📡 Sending GET request to http://localhost:${TEST_PORT}/api/health...`);
    
    const req = http.request(requestOptions, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          console.log(`📥 Received response with HTTP Status Code: ${res.statusCode}`);
          if (res.statusCode !== 200 && res.statusCode !== 503) {
            throw new Error(`Invalid status code returned. Expected 200 or 503, got ${res.statusCode}`);
          }
          
          const responseBody = JSON.parse(data);
          console.log('🩺 HealthCheck Payload keys:', Object.keys(responseBody));
          
          // Verify required production telemetry properties are present
          const requiredKeys = ['status', 'timestamp', 'uptime', 'memory', 'systems', 'metrics'];
          const missingKeys = requiredKeys.filter(key => !(key in responseBody));
          
          if (missingKeys.length > 0) {
            throw new Error(`Telemetry verification failed. Missing health properties: ${missingKeys.join(', ')}`);
          }
          
          console.log('✅ Telemetry verification succeeded. Health properties validated.');
          console.log('🩺 System Health Status:', responseBody.status);
          console.log('🩺 Memory footprint (RSS):', responseBody.memory.rss);
          
          // Clean shutdown
          cleanupAndExit(0);
        } catch (err) {
          console.error('❌ JSON parsing or payload check failed:', err.message);
          cleanupAndExit(1);
        }
      });
    });
    
    req.on('error', (err) => {
      console.error('❌ Request error on health ping:', err.message);
      cleanupAndExit(1);
    });
    
    req.on('timeout', () => {
      console.error('❌ Health check ping timed out after 3 seconds');
      req.destroy();
      cleanupAndExit(1);
    });
    
    req.end();
  });
  
  function cleanupAndExit(code) {
    console.log('🛑 Shutting down temporary smoke server...');
    server.close(() => {
      console.log('👋 Smoke server closed.');
      process.exit(code);
    });
    
    // Safety exit force-out
    setTimeout(() => {
      console.log('⚠️ Forced shutdown due to lingering handles.');
      process.exit(code);
    }, 2000);
  }
  
} catch (error) {
  console.error('❌ Critical compilation or loading crash:', error.stack || error);
  process.exit(1);
}
