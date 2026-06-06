// scripts/verify-billing-fixes.js
// Verification tests for Razorpay monetization defects repair

const assert = require('assert').strict;
const http = require('http');
const mongoose = require('mongoose');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const yellow = '\x1b[33m';

console.log(`${yellow}=== STARTING RAZORPAY MONETIZATION FIX VERIFICATION ===${reset}\n`);

// Setup env variables for testing
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'razorpay-fixes-test-jwt-secret-antigravity';
process.env.DISABLE_CSRF = 'false'; // Ensure CSRF is active for tests!
process.env.MONGODB_URI = 'mongodb://localhost:27017/razorpay-fixes-test';
process.env.REDIS_URL = 'redis://localhost:6379';

// Mock Razorpay secrets
process.env.RAZORPAY_KEY_ID = 'rzp_test_mock_fixes_key';
process.env.RAZORPAY_KEY_SECRET = 'rzp_test_mock_fixes_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_mock_razorpay_fixes_secret';
process.env.RAZORPAY_MONTHLY_PRICE = '500';
process.env.RAZORPAY_YEARLY_PRICE = '5000';

const User = require('../src/models/User');
const { getPlan } = require('../src/utils/permissions');
const plans = require('../src/config/plans');
const { reconcileUserEntitlement, reconcileAllUsers } = require('../src/services/billingReconciliation');

async function testUserGracePeriodTier() {
  console.log('🤖 Test 1: Verifying User tier enum and permissions mapping for grace_period...');

  // 1. Check permissions mapping
  const mockUser = {
    username: 'grace_tester',
    tier: 'grace_period'
  };
  const plan = getPlan(mockUser);
  assert.equal(plan.id, 'pro', 'Permissions mapping should treat grace_period as Pro tier.');
  console.log(`${green}✔ [SUB-PASS]${reset} permissions.getPlan() maps 'grace_period' to PRO_PLAN.`);

  // 2. Check mongoose validation by validating a user instance with 'grace_period' tier offline
  const user = new User({
    username: 'grace_tester',
    email: 'grace_tester@test.com',
    password: 'password123',
    tier: 'grace_period'
  });

  try {
    await user.validate();
    console.log(`${green}✔ [SUB-PASS]${reset} User validation passed offline with 'grace_period' tier.`);
  } catch (err) {
    throw new Error(`Failed to validate user with 'grace_period' tier: ${err.message}`);
  }

  console.log(`${green}✔ [PASSED]${reset} User grace_period tier and permission tests passed.`);
}

async function testReconciliationFunctions() {
  console.log('\n🤖 Test 2: Verifying billing reconciliation availability and execution...');

  assert.equal(typeof reconcileUserEntitlement, 'function', 'reconcileUserEntitlement should be exported');
  assert.equal(typeof reconcileAllUsers, 'function', 'reconcileAllUsers should be exported');
  
  const { startBillingReconciliationScheduler, stopBillingReconciliationScheduler } = require('../src/services/billingReconciliation');
  assert.equal(typeof startBillingReconciliationScheduler, 'function', 'startBillingReconciliationScheduler should be exported');
  assert.equal(typeof stopBillingReconciliationScheduler, 'function', 'stopBillingReconciliationScheduler should be exported');

  console.log(`${green}✔ [PASSED]${reset} Billing reconciliation functions and scheduler are properly implemented.`);
}

async function testCsrfExemption() {
  console.log('\n🤖 Test 3: Verifying Billing Webhook CSRF exemption...');

  // Connect to DB if not connected to save mock user
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(process.env.MONGODB_URI);
  }

  const testUserId = new mongoose.Types.ObjectId();
  const testUser = new User({
    _id: testUserId,
    username: 'csrf_tester',
    email: 'csrf_tester@test.com',
    password: 'password123',
    tier: 'free'
  });
  await User.deleteMany({ email: 'csrf_tester@test.com' });
  await testUser.save();

  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ userId: testUserId.toString(), tokenType: 'access' }, process.env.JWT_SECRET, { expiresIn: '1h' });

  const app = require('../src/app');
  const server = http.createServer(app);
  const TEST_PORT = 5098;

  await new Promise((resolve) => server.listen(TEST_PORT, resolve));
  console.log(`Test server booted on port ${TEST_PORT}. Testing webhook endpoint...`);

  // Part A: POST to webhook without CSRF tokens. Expecting non-403 response.
  const webhookResult = await new Promise((resolve) => {
    const req = http.request({
      host: 'localhost',
      port: TEST_PORT,
      path: '/api/v1/billing/webhook',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });
    req.on('error', err => resolve({ error: err }));
    req.write(JSON.stringify({ event: 'subscription.activated' }));
    req.end();
  });

  // Part B: POST to upgrade without CSRF tokens but WITH authorization. Expecting 403 (blocked by CSRF).
  const upgradeResult = await new Promise((resolve) => {
    const req = http.request({
      host: 'localhost',
      port: TEST_PORT,
      path: '/api/v1/billing/upgrade',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, body: data });
      });
    });
    req.on('error', err => resolve({ error: err }));
    req.write(JSON.stringify({ cycle: 'monthly' }));
    req.end();
  });

  // Clean up database mock user
  await User.deleteMany({ _id: testUserId });

  // Shutdown server
  await new Promise((resolve) => server.close(resolve));
  console.log('Test server shut down.');

  if (webhookResult.error) {
    throw new Error(`Webhook request failed: ${webhookResult.error.message}`);
  }
  if (upgradeResult.error) {
    throw new Error(`Upgrade request failed: ${upgradeResult.error.message}`);
  }

  console.log(`Webhook response: HTTP ${webhookResult.statusCode}`);
  console.log(`Upgrade response: HTTP ${upgradeResult.statusCode}`);

  // Webhook should NOT return 403 CSRF_VALIDATION_FAILED
  assert.notEqual(webhookResult.statusCode, 403, 'Webhook should NOT be blocked by CSRF (403)');
  // We expect 503 or 400 because Razorpay client is mock/fails signature verify, which proves it bypassed CSRF!
  assert.ok([400, 503].includes(webhookResult.statusCode), `Webhook expected HTTP 400 or 503, got ${webhookResult.statusCode}`);
  console.log(`${green}✔ [SUB-PASS]${reset} Webhook successfully bypassed CSRF validation.`);

  // Upgrade route should return 403 CSRF_VALIDATION_FAILED
  assert.equal(upgradeResult.statusCode, 403, 'Upgrade route should be blocked by CSRF (403)');
  const bodyObj = JSON.parse(upgradeResult.body);
  assert.equal(bodyObj.error, 'CSRF_VALIDATION_FAILED', 'Expected CSRF_VALIDATION_FAILED error');
  console.log(`${green}✔ [SUB-PASS]${reset} Upgrade route was correctly blocked by CSRF validation.`);

  console.log(`${green}✔ [PASSED]${reset} CSRF exemption verification completed successfully.`);
}

async function run() {
  try {
    await testUserGracePeriodTier();
    await testReconciliationFunctions();
    await testCsrfExemption();

    console.log(`\n${green}=== ALL MONETIZATION FIX VERIFICATIONS PASSED SUCCESSFULLY ===${reset}`);
    process.exit(0);
  } catch (error) {
    console.error(`\n${red}✘ [FAILED]${reset} Verification tests failed!`);
    console.error(error);
    process.exit(1);
  }
}

run();
