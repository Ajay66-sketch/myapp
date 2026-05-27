// scripts/test-bypass-attempts.js
// Security smoke test harness for Stripe integration, bypass enforcements, and webhook integrity

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

// Test 1: Verify startup validation fails on missing production configuration
function testEnvironmentValidation() {
  console.log('🛡️  1. Verifying environment pre-boot validation enforcements...');
  
  // Set up mock missing variables
  const originalStripeKey = process.env.STRIPE_API_KEY;
  delete process.env.STRIPE_API_KEY;

  let crashed = false;
  const originalExit = process.exit;
  
  process.exit = (code) => {
    crashed = true;
    process.exit = originalExit; // Restore exit handler
    throw new Error('PROCESS_EXIT_TRIGGERED');
  };

  try {
    delete require.cache[require.resolve('../src/config/env')];
    const envConfig = require('../src/config/env');
    envConfig.validateApiEnv();
  } catch (err) {
    if (err.message !== 'PROCESS_EXIT_TRIGGERED') {
      throw err;
    }
  }

  process.env.STRIPE_API_KEY = originalStripeKey; // Restore
  assert.equal(crashed, true, 'App did not refuse startup when STRIPE_API_KEY was missing in production!');
  console.log(`${green}✔ [PASSED]${reset} Pre-boot validation refuses startup when secrets are missing.`);
}

// Test 2: Verify safe failures inside billing upgrades on missing configurations
async function testSafeFailureOnMissingStripe() {
  console.log('\n🛡️  2. Verifying billing upgrade fails safely when Stripe is disabled...');

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

  // Save current Stripe key to mock disabled state
  const originalStripeKey = process.env.STRIPE_API_KEY;
  delete process.env.STRIPE_API_KEY;

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
  process.env.STRIPE_API_KEY = originalStripeKey;

  assert.equal(res.getStatus(), 503, 'Expected 503 Service Unavailable when Stripe is not configured');
  assert.equal(res.getBody().error, 'BILLING_SERVICE_UNAVAILABLE', 'Expected safe-failure error payload');
  assert.notEqual(mockUser.tier, 'pro', 'User was incorrectly upgraded to Pro tier during failure!');

  console.log(`${green}✔ [PASSED]${reset} Billing upgrade fails safely with 503 and protects free tier.`);
}

// Test 3: Verify webhook signature enforcements are mandatory
async function testWebhookSignatureEnforcement() {
  console.log('\n🛡️  3. Verifying webhook signature validation enforcements in production...');

  const req = {
    headers: {}, // No stripe-signature header
    body: { type: 'checkout.session.completed', data: { object: { id: 'cs_test' } } },
    originalUrl: '/api/v1/billing/webhook',
  };

  const res = createMockResponse();

  // Configure Stripe keys to trigger signature path
  process.env.STRIPE_API_KEY = 'sk_test_bypass_test_antigravity';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_bypass_test_antigravity';
  process.env.NODE_ENV = 'production';

  // Hot-reload router
  const billingRouter = reloadBillingRouter();
  const webhookHandler = billingRouter.stack.find(
    layer => layer.route && layer.route.path === '/webhook'
  ).route.stack[0].handle;

  await webhookHandler(req, res, (err) => {
    if (err) throw err;
  });

  assert.equal(res.getStatus(), 400, 'Expected 400 Bad Request when signature header is missing');
  assert.ok(
    res.getBody().includes('Webhook Error: Stripe signature and secret are mandatory') ||
    res.getBody().error === 'STRIPE_DISABLED',
    'Missing signature bypass rejected message'
  );

  console.log(`${green}✔ [PASSED]${reset} Webhook signature verification is strictly mandatory in production.`);
}

// Test 4: Verify Webhook Reconciliation service functions properly
async function testEntitlementReconciliation() {
  console.log('\n🛡️  4. Testing webhook reconciliation synchronization logic...');

  // Mock Stripe API key configuration
  process.env.STRIPE_API_KEY = 'sk_test_mock_keys_antigravity';

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
    stripeCustomerId: null,
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
  assert.equal(resDowngrade.action, 'downgraded_no_customer');
  assert.equal(mockUserInstance.tier, 'free');
  assert.equal(userSaved, true);

  console.log(`${green}✔ [PASSED]${reset} Webhook reconciliation service handles errors and safe-fallbacks.`);
}

async function runAll() {
  try {
    testEnvironmentValidation();
    await testSafeFailureOnMissingStripe();
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
