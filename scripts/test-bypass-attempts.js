// scripts/test-bypass-attempts.js
// Security smoke test harness for Razorpay integration, bypass enforcements, and webhook integrity

const assert = require('assert').strict;
const mongoose = require('mongoose');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const yellow = '\x1b[33m';

console.log(`${yellow}=== STARTING SAAS MONETIZATION BYPASS SECURITY TESTS ===${reset}\n`);

// Mock Environment vars for testing
process.env.NODE_ENV = 'production';
process.env.JWT_SECRET = 'bypass-test-jwt-secret-antigravity';

// Helper to fully mock Express Response
function createMockResponse() {
  let resStatus = null;
  let resBody = null;
  
  const res = {
    status(code) {
      resStatus = code;
      return this;
    },
    send(data) {
      resBody = data;
      return this;
    },
    json(data) {
      resBody = data;
      return this;
    },
    getStatus: () => resStatus,
    getBody: () => resBody,
  };
  
  return res;
}

// Helper to purge require cache for hot-reload testing
function reloadBillingRouter() {
  delete require.cache[require.resolve('../src/routes/billing')];
  return require('../src/routes/billing');
}

// Test 1: Verify startup validation behavior on missing keys (optional vs. core required)
function testEnvironmentValidation() {
  console.log('🛡️  1. Verifying environment pre-boot validation enforcements...');
  
  // Set up mock exit handlers
  let crashed = false;
  const originalExit = process.exit;
  
  process.exit = (code) => {
    crashed = true;
    process.exit = originalExit; // Restore exit handler
    throw new Error('PROCESS_EXIT_TRIGGERED');
  };

  // Mock core variables so they don't trigger crashes in Scenario A
  const originalMongo = process.env.MONGODB_URI;
  const originalRedis = process.env.REDIS_URL;
  process.env.MONGODB_URI = 'mongodb://localhost:27017/scholar_test';
  process.env.REDIS_URL = 'redis://localhost:6379';

  // Scenario A: Missing optional key RAZORPAY_KEY_ID -> should NOT crash
  const originalRazorpayKey = process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_ID;

  try {
    delete require.cache[require.resolve('../src/config/env')];
    global.__preBootAuditExecuted = false;
    const envConfig = require('../src/config/env');
    envConfig.validateApiEnv();
  } catch (err) {
    if (err.message !== 'PROCESS_EXIT_TRIGGERED') {
      throw err;
    }
  }

  process.env.RAZORPAY_KEY_ID = originalRazorpayKey; // Restore
  assert.equal(crashed, false, 'App incorrectly refused startup when RAZORPAY_KEY_ID was missing in production!');
  console.log(`${green}✔ [SUB-PASS]${reset} Pre-boot validation succeeds when optional Razorpay secrets are missing.`);

  // Scenario B: Missing CORE REQUIRED key JWT_SECRET -> should crash
  const originalJwtSecret = process.env.JWT_SECRET;
  delete process.env.JWT_SECRET;
  crashed = false;

  process.exit = (code) => {
    crashed = true;
    process.exit = originalExit; // Restore exit handler
    throw new Error('PROCESS_EXIT_TRIGGERED');
  };

  try {
    delete require.cache[require.resolve('../src/config/env')];
    global.__preBootAuditExecuted = false;
    const envConfig = require('../src/config/env');
    envConfig.validateApiEnv();
  } catch (err) {
    if (err.message !== 'PROCESS_EXIT_TRIGGERED') {
      throw err;
    }
  }

  process.env.JWT_SECRET = originalJwtSecret; // Restore
  process.env.MONGODB_URI = originalMongo;
  process.env.REDIS_URL = originalRedis;
  process.exit = originalExit; // Restore exit handler
  assert.equal(crashed, true, 'App did not refuse startup when core JWT_SECRET was missing in production!');
  console.log(`${green}✔ [SUB-PASS]${reset} Pre-boot validation refuses startup when core JWT_SECRET is missing.`);
  console.log(`${green}✔ [PASSED]${reset} SRE Gate classification rules are correctly enforced.`);
}

// Test 2: Verify safe failures inside billing upgrades on missing configurations
async function testSafeFailureOnMissingRazorpay() {
  console.log('\n🛡️  2. Verifying billing upgrade fails safely when Razorpay is disabled...');

  const mockUser = {
    _id: new mongoose.Types.ObjectId(),
    username: 'tester',
    email: 'tester@test.com',
    tier: 'free',
  };

  const req = {
    body: { cycle: 'monthly' },
    user: mockUser,
    originalUrl: '/api/v1/billing/upgrade',
  };

  const res = createMockResponse();

  // Save current Razorpay key to mock disabled state
  const originalRazorpayKey = process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_ID;

  // Hot-reload router
  const billingRouter = reloadBillingRouter();
  
  // Extract upgrade handler
  const upgradeHandler = billingRouter.stack.find(
    layer => layer.route && layer.route.path === '/upgrade'
  ).route.stack[0].handle;

  await upgradeHandler(req, res, (err) => {
    if (err) throw err;
  });

  // Restore key
  process.env.RAZORPAY_KEY_ID = originalRazorpayKey;

  assert.equal(res.getStatus(), 503, 'Expected 503 Service Unavailable when Razorpay is not configured');
  assert.equal(res.getBody().error, 'Billing temporarily unavailable', 'Expected safe-failure error payload');
  assert.notEqual(mockUser.tier, 'pro', 'User was incorrectly upgraded to Pro tier during failure!');

  console.log(`${green}✔ [PASSED]${reset} Billing upgrade fails safely with 503 and protects free tier.`);
}

// Test 3: Verify webhook signature enforcements are mandatory
async function testWebhookSignatureEnforcement() {
  console.log('\n🛡️  3. Verifying webhook signature validation enforcements in production...');

  const req = {
    headers: {}, // No signature header
    body: { event: 'subscription.activated', payload: { subscription: { entity: { id: 'sub_test_123', status: 'active' } } } },
    originalUrl: '/api/v1/billing/webhook',
  };

  const res = createMockResponse();

  // Configure keys to trigger signature path
  process.env.RAZORPAY_KEY_ID = 'rzp_test_bypass';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_secret_bypass';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'whsec_test_bypass';
  process.env.NODE_ENV = 'production';

  // Hot-reload router
  const billingRouter = reloadBillingRouter();
  const webhookHandler = billingRouter.stack.find(
    layer => layer.route && layer.route.path === '/webhook'
  ).route.stack[0].handle;

  await webhookHandler(req, res, (err) => {
    if (err) throw err;
  });

  assert.equal(res.getStatus(), 503, 'Expected 503 Service Unavailable when signature header is missing');
  assert.equal(
    res.getBody().error,
    'Billing temporarily unavailable',
    'Missing signature bypass rejected message'
  );

  console.log(`${green}✔ [PASSED]${reset} Webhook signature verification is strictly mandatory in production.`);
}

// Test 4: Verify Webhook Reconciliation service functions properly
async function testEntitlementReconciliation() {
  console.log('\n🛡️  4. Testing webhook reconciliation synchronization logic...');

  // Mock Razorpay config
  process.env.RAZORPAY_KEY_ID = 'rzp_test_mock';
  process.env.RAZORPAY_KEY_SECRET = 'rzp_secret_mock';

  delete require.cache[require.resolve('../src/config/razorpay')];
  delete require.cache[require.resolve('../src/services/billingReconciliation')];

  const User = require('../src/models/User');
  const userRepository = require('../src/repositories/UserRepository');
  const { reconcileUserEntitlement } = require('../src/services/billingReconciliation');

  const fakeId = new mongoose.Types.ObjectId();

  // Mock findById to avoid Mongoose buffering connection timeouts
  User.findById = async (id) => {
    if (id.toString() === fakeId.toString()) {
      return null;
    }
    return null;
  };

  // Verify missing user scenario
  const resNull = await reconcileUserEntitlement(fakeId);
  assert.equal(resNull.success, false);
  assert.equal(resNull.reason, 'USER_NOT_FOUND');

  // Verify pro user with missing customer ID triggers downgrade
  let userSaved = false;
  const mockUserInstance = {
    _id: fakeId,
    username: 'tester',
    tier: 'pro',
    billing: {
      customerId: null,
      subscriptionId: null,
      status: null
    },
    save: async function() {
      userSaved = true;
      return this;
    }
  };

  User.findById = async (id) => {
    if (id.toString() === fakeId.toString()) {
      return mockUserInstance;
    }
    return null;
  };

  // Mock userRepository.update to bypass DB write checks in test environment
  userRepository.update = async (id, data) => {
    return mockUserInstance;
  };

  const resDowngrade = await reconcileUserEntitlement(fakeId);
  assert.equal(resDowngrade.success, true);
  assert.equal(resDowngrade.reconciled, true);
  assert.equal(resDowngrade.action, 'downgraded_no_subscription');
  assert.equal(mockUserInstance.tier, 'free');
  assert.equal(userSaved, true);

  console.log(`${green}✔ [PASSED]${reset} Webhook reconciliation service handles errors and safe-fallbacks.`);
}

async function runAll() {
  try {
    testEnvironmentValidation();
    await testSafeFailureOnMissingRazorpay();
    await testWebhookSignatureEnforcement();
    await testEntitlementReconciliation();
    
    console.log(`\n${green}=== ALL BYPASS SECURITY VERIFICATIONS PASSED SUCCESSFULLY ===${reset}`);
    process.exit(0);
  } catch (error) {
    console.error(`\n${red}✘ [FAILED]${reset} Security checks failed!`);
    console.error(error);
    process.exit(1);
  }
}

runAll();
