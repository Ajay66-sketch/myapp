// scripts/verifyProductionHardening.js
// Automated verification suite for Phase 1 production readiness and SRE hardening

const assert = require('assert').strict;
const path = require('path');

// Mock environmental requirements to boot configurations
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'super-secret-test-key-1234567890';
process.env.MONGODB_URI = 'mongodb://localhost:27017/scholar_test';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_secret_key_prod_readiness';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_mock_webhook_secret';
process.env.STRIPE_MONTHLY_PRICE_ID = 'price_123';
process.env.STRIPE_YEARLY_PRICE_ID = 'price_456';
process.env.POSTHOG_API_KEY = 'phc_mock_key';
process.env.POSTHOG_HOST = 'https://app.posthog.com';
process.env.OPENAI_API_KEY = 'sk-mock-openai-key-for-hardening-checks';

console.log('🧪 Starting Phase 1 Production Readiness verification harness...\n');

async function testEnvironmentSync() {
  console.log('📡 Testing Task 1: Environment Sync & Validation...');
  
  // Clear any existing sync keys to verify cold-sync
  delete process.env.MONGO_URI;
  delete process.env.STRIPE_API_KEY;

  const env = require('../src/config/env');
  
  // Trigger sync blocks
  assert.equal(process.env.MONGO_URI, process.env.MONGODB_URI, 'MONGO_URI did not sync from MONGODB_URI');
  assert.equal(process.env.STRIPE_API_KEY, process.env.STRIPE_SECRET_KEY, 'STRIPE_API_KEY did not sync from STRIPE_SECRET_KEY');
  
  console.log('   ✅ Environment Sync and bi-directional validation passed.');
}

async function testCentralizedRouter() {
  console.log('📡 Testing Task 2: API Route Centralization...');
  
  const globalRouter = require('../src/routes');
  assert.ok(globalRouter, 'Failed to import centralized router index.js');
  assert.equal(typeof globalRouter, 'function', 'centralized router is not a function');
  assert.ok(globalRouter.stack && globalRouter.stack.length > 0, 'Centralized router stack is empty');
  
  console.log('   ✅ Centralized API Routing verification passed.');
}

async function testCentralizedErrorHandling() {
  console.log('📡 Testing Task 3: Centralized Global Error Handler...');
  
  const globalErrorHandler = require('../src/middleware/errorHandler');
  assert.equal(typeof globalErrorHandler, 'function', 'errorHandler is not a function');

  // Assert it maps errors correctly and strips stacks in production
  process.env.NODE_ENV = 'production';
  let jsonResponse = null;
  let responseStatus = null;
  
  const mockReq = {
    method: 'GET',
    originalUrl: '/test-error-path',
    ip: '127.0.0.1',
    headers: {}
  };
  
  const mockRes = {
    status(code) {
      responseStatus = code;
      return this;
    },
    json(payload) {
      jsonResponse = payload;
      return this;
    }
  };
  
  const testError = new Error('Database connection timed out');
  testError.statusCode = 500;
  
  globalErrorHandler(testError, mockReq, mockRes, () => {});
  
  assert.equal(responseStatus, 500, 'Global error handler did not output correct status');
  assert.equal(jsonResponse.status, 'error', 'JSON response format incorrect');
  assert.equal(jsonResponse.message, 'Internal server error', 'Sensitive error message exposed in production');
  assert.equal(jsonResponse.stack, undefined, 'Stack trace leaked in production');

  // Verify stack trace inclusion in development mode
  process.env.NODE_ENV = 'development';
  globalErrorHandler(testError, mockReq, mockRes, () => {});
  assert.equal(jsonResponse.message, 'Database connection timed out', 'Error message not preserved in dev');
  assert.ok(jsonResponse.stack, 'Stack trace missing in development mode');
  
  console.log('   ✅ Centralized JSON Error Handler and production masking passed.');
}

async function testSuspiciousLoginDetector() {
  console.log('📡 Testing Task 4: Anomaly travel checks & Session retrieval...');
  
  const { detectSuspiciousLogin } = require('../src/utils/suspiciousLoginDetector');
  assert.equal(typeof detectSuspiciousLogin, 'function', 'detectSuspiciousLogin is not a function');
  
  // Test mock travel alert trigger
  const mockUser = { _id: 'mock-user-112233' };
  const mockReq = {
    ip: '192.168.10.1',
    headers: { 'user-agent': 'Chrome SRE' },
    socket: {}
  };
  
  // No error should be thrown, executes gracefully
  await detectSuspiciousLogin(mockUser, mockReq);
  console.log('   ✅ Suspicious Login Detector is operational.');
}

async function runHardeningSuite() {
  try {
    await testEnvironmentSync();
    await testCentralizedRouter();
    await testCentralizedErrorHandling();
    await testSuspiciousLoginDetector();
    
    console.log('\n🏆 Phase 1 Backend Production Readiness Hardening PASSED successfully!');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Production Readiness verification failed:', err);
    process.exit(1);
  }
}

runHardeningSuite();
