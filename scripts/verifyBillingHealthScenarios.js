// scripts/verifyBillingHealthScenarios.js
// Automated verification suite for Razorpay / general billing health check scenarios

const assert = require('assert').strict;
const http = require('http');

console.log('🏁 Initiating Billing health check scenario tests...');

// Mock necessary env vars to avoid crash in development/CI environments
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'ci-verification-unsafe-jwt-secret-antigravity';
process.env.DISABLE_CSRF = 'true';
process.env.MONGODB_URI = 'mongodb://localhost:27017/ci-test-db';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.CLIENT_URL = 'http://localhost:3000';

// Mock other services secrets
process.env.RAZORPAY_KEY_ID = 'rzp_mock_key_id';
process.env.RAZORPAY_KEY_SECRET = 'rzp_mock_key_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_verify_build_mock_key';
process.env.RAZORPAY_MONTHLY_PRICE = '500';
process.env.RAZORPAY_YEARLY_PRICE = '5000';
process.env.POSTHOG_API_KEY = 'phc_test_verify_build_mock_key';
process.env.POSTHOG_HOST = 'https://app.posthog.com';
process.env.OPENAI_API_KEY = 'sk_mock_openai_key_for_ci_verification';

// Import app and service registry
const app = require('../src/app');
const { updateServiceState } = require('../src/config/serviceRegistry');

const server = http.createServer(app);

// Helper function to query /health
async function queryHealth(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/health`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode,
            body: JSON.parse(data)
          });
        } catch (e) {
          reject(new Error(`Failed to parse response JSON: ${data}`));
        }
      });
    }).on('error', reject);
  });
}

async function runTests() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`📡 Test server listening on 127.0.0.1:${port}`);

  try {
    // -------------------------------------------------------------
    // Scenario 1: Billing disabled => healthy
    // -------------------------------------------------------------
    console.log('\n🧪 Running Scenario 1: Billing disabled => healthy...');
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    
    updateServiceState('redis', 'UP');
    updateServiceState('queue', 'ACTIVE');
    updateServiceState('billing', 'DOWN'); // Billing is down, but not configured!

    let res = await queryHealth(port);
    console.log('Response status:', res.body.status);
    console.log('systemState:', JSON.stringify(res.body.systemState));
    
    assert.equal(res.statusCode, 200, 'HTTP status code should be 200');
    assert.equal(res.body.status, 'healthy', 'System status should be healthy');
    assert.deepEqual(res.body.systemState, {
      redis: 'UP',
      queue: 'ACTIVE',
      billing: 'DOWN'
    }, 'System state matches expected output');
    console.log('✅ Scenario 1 Passed.');

    // -------------------------------------------------------------
    // Scenario 2: Billing configured + UP => healthy
    // -------------------------------------------------------------
    console.log('\n🧪 Running Scenario 2: Billing configured + UP => healthy...');
    process.env.RAZORPAY_KEY_ID = 'rzp_mock_key_id';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_mock_key_secret';
    
    updateServiceState('redis', 'UP');
    updateServiceState('queue', 'ACTIVE');
    updateServiceState('billing', 'UP');

    res = await queryHealth(port);
    console.log('Response status:', res.body.status);
    console.log('systemState:', JSON.stringify(res.body.systemState));

    assert.equal(res.statusCode, 200, 'HTTP status code should be 200');
    assert.equal(res.body.status, 'healthy', 'System status should be healthy');
    assert.deepEqual(res.body.systemState, {
      redis: 'UP',
      queue: 'ACTIVE',
      billing: 'UP'
    }, 'System state matches expected output');
    console.log('✅ Scenario 2 Passed.');

    // -------------------------------------------------------------
    // Scenario 3: Billing configured + DOWN => degraded
    // -------------------------------------------------------------
    console.log('\n🧪 Running Scenario 3: Billing configured + DOWN => degraded...');
    process.env.RAZORPAY_KEY_ID = 'rzp_mock_key_id';
    process.env.RAZORPAY_KEY_SECRET = 'rzp_mock_key_secret';
    
    updateServiceState('redis', 'UP');
    updateServiceState('queue', 'ACTIVE');
    updateServiceState('billing', 'DOWN');

    res = await queryHealth(port);
    console.log('Response status:', res.body.status);
    console.log('systemState:', JSON.stringify(res.body.systemState));

    assert.equal(res.statusCode, 200, 'HTTP status code should be 200');
    assert.equal(res.body.status, 'degraded', 'System status should be degraded');
    assert.deepEqual(res.body.systemState, {
      redis: 'UP',
      queue: 'ACTIVE',
      billing: 'DOWN'
    }, 'System state matches expected output');
    console.log('✅ Scenario 3 Passed.');

    // -------------------------------------------------------------
    // Additional Scenario: Queue OFFLINE => degraded
    // -------------------------------------------------------------
    console.log('\n🧪 Running Scenario 4: Queue OFFLINE => degraded...');
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    updateServiceState('redis', 'UP');
    updateServiceState('queue', 'OFFLINE');
    updateServiceState('billing', 'DOWN');

    res = await queryHealth(port);
    console.log('Response status:', res.body.status);
    console.log('systemState:', JSON.stringify(res.body.systemState));

    assert.equal(res.statusCode, 200, 'HTTP status code should be 200');
    assert.equal(res.body.status, 'degraded', 'System status should be degraded');
    console.log('✅ Scenario 4 Passed.');

    console.log('\n🏆 ALL BILLING HEALTH SCENARIO TESTS PASSED SUCCESSFULLY!\n');
    server.close();
    process.exit(0);

  } catch (err) {
    console.error('\n❌ Test execution failed:', err);
    server.close();
    process.exit(1);
  }
}

runTests();
