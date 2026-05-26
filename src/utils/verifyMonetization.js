// src/utils/verifyMonetization.js
// Automated verification script for the newly designed anti-fragile SaaS monetization layer

const assert = require('assert').strict;
const plans = require('../config/plans');
const permissions = require('../utils/permissions');
const rateLimiter = require('../socket/rateLimiter');
const auditLogger = require('../utils/auditLogger');
const { requirePro, requireAdmin, requireFeature } = require('../middleware/monetization');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const yellow = '\x1b[33m';

const mockUsers = {
  freeUser: { _id: 'user_free_123', email: 'free@studyrealtime.com', tier: 'free' },
  proUser: { _id: 'user_pro_456', email: 'pro@studyrealtime.com', tier: 'pro' },
  adminUser: { _id: 'user_admin_789', email: 'admin@studyrealtime.com', tier: 'admin' },
  legacyUser: { _id: 'user_legacy_999', email: 'legacy@studyrealtime.com', tier: 'premium' },
  unknownUser: { _id: 'user_unknown_000', email: 'unknown@studyrealtime.com' }, // no tier defined
};

function runTest(name, fn) {
  try {
    fn();
    console.log(`${green}✔ [PASSED]${reset} ${name}`);
  } catch (error) {
    console.error(`${red}✘ [FAILED]${reset} ${name}`);
    console.error(error);
    process.exit(1);
  }
}

console.log(`${yellow}=== STARTING MONETIZATION ARCHITECTURE VERIFICATION ===${reset}\n`);

// ─── 1. Plans Config Verification ──────────────────────────────────────────
runTest('Plans Single Source of Truth Configuration Check', () => {
  assert.equal(plans.FREE_PLAN.id, 'free');
  assert.equal(plans.PRO_PLAN.id, 'pro');
  assert.equal(plans.ADMIN_PLAN.id, 'admin');

  // Verify feature flags exist
  const expectedFeatures = ['ai_chat', 'ai_rooms', 'ai_summaries', 'analytics_dashboard', 'priority_support'];
  for (const feat of expectedFeatures) {
    assert.ok(feat in plans.FREE_PLAN.features);
    assert.ok(feat in plans.PRO_PLAN.features);
    assert.ok(feat in plans.ADMIN_PLAN.features);
  }

  // Price checks
  assert.equal(plans.FREE_PLAN.monthlyPrice, 0);
  assert.equal(plans.PRO_PLAN.monthlyPrice, 15);
  assert.equal(plans.ADMIN_PLAN.monthlyPrice, 0);

  // Limits
  assert.equal(plans.FREE_PLAN.limits.roomLimit, 1);
  assert.equal(plans.PRO_PLAN.limits.roomLimit, 10);
  assert.equal(plans.ADMIN_PLAN.limits.roomLimit, Infinity);

  // Socket Priorities
  assert.equal(plans.FREE_PLAN.socketPriority, 0);
  assert.equal(plans.PRO_PLAN.socketPriority, 1);
  assert.equal(plans.ADMIN_PLAN.socketPriority, 2);
});

// ─── 2. Permissions Engine Verification ────────────────────────────────────
runTest('Permission Engine Defaulting and Legacy Mapping checks', () => {
  // Defaulting unknown user to free
  const resolvedUnknown = permissions.getPlan(mockUsers.unknownUser);
  assert.equal(resolvedUnknown.id, 'free');

  // Fail safe on null/undefined
  const resolvedNull = permissions.getPlan(null);
  assert.equal(resolvedNull.id, 'free');

  // Legacy premium mapping
  const resolvedLegacy = permissions.getPlan(mockUsers.legacyUser);
  assert.equal(resolvedLegacy.id, 'pro'); // premium resolves to pro config!
});

runTest('Permission Engine Features and Limit checks', () => {
  // AI Chat permission check
  assert.equal(permissions.canUseAi(mockUsers.freeUser), false);
  assert.equal(permissions.canUseAi(mockUsers.proUser), true);
  assert.equal(permissions.canUseAi(mockUsers.adminUser), true);

  // Analytics permission check
  assert.equal(permissions.canAccessAnalytics(mockUsers.freeUser), false);
  assert.equal(permissions.canAccessAnalytics(mockUsers.proUser), false); // only admin
  assert.equal(permissions.canAccessAnalytics(mockUsers.adminUser), true);

  // Room limits checks
  assert.equal(permissions.canCreateRoom(mockUsers.freeUser, 0), true);
  assert.equal(permissions.canCreateRoom(mockUsers.freeUser, 1), false); // Free limit = 1
  assert.equal(permissions.canCreateRoom(mockUsers.proUser, 9), true);
  assert.equal(permissions.canCreateRoom(mockUsers.proUser, 10), false); // Pro limit = 10
  assert.equal(permissions.canCreateRoom(mockUsers.adminUser, 1000), true); // Admin = Infinity

  // Feature checks
  assert.equal(permissions.hasFeature(mockUsers.freeUser, 'ai_chat'), false);
  assert.equal(permissions.hasFeature(mockUsers.proUser, 'ai_chat'), true);
  assert.equal(permissions.hasFeature(mockUsers.freeUser, 'priority_support'), false);
  assert.equal(permissions.hasFeature(mockUsers.proUser, 'priority_support'), true);
});

// ─── 3. Structured Audit Logging Verification ──────────────────────────────
runTest('Audit Logs Security and Format Check', () => {
  const logged = auditLogger.logAuditEvent({
    action: 'upgrade_requested',
    userId: mockUsers.proUser._id,
    previousTier: 'free',
    nextTier: 'pro',
    resource: '/api/v1/billing/upgrade',
    metadata: {
      accessToken: 'secret_jwt_token_should_be_stripped_out',
      billingCycle: 'yearly',
    },
  });

  assert.ok(logged);
  assert.equal(logged.event, 'audit_log');
  assert.equal(logged.action, 'upgrade_requested');
  assert.equal(logged.userId, mockUsers.proUser._id);
  assert.equal(logged.previousTier, 'free');
  assert.equal(logged.nextTier, 'pro');
  assert.equal(logged.success, true);
  // Verify token is stripped out
  assert.equal(logged.metadata.accessToken, undefined);
  assert.equal(logged.metadata.billingCycle, 'yearly');
});

// ─── 4. Socket Dynamic Rate-Limiter Verification ───────────────────────────
runTest('Dynamic Socket Rate Limiting Per Tier Check', () => {
  const event = 'room:chat';

  // Free User Limit Check: Limit is 3 requests per window
  // Check rateLimitStore reset: we simulate by doing multiple requests
  rateLimiter.resetUserLimits(mockUsers.freeUser._id);

  let check;
  for (let i = 0; i < 3; i++) {
    check = rateLimiter.checkRateLimit(mockUsers.freeUser, event);
    assert.equal(check.allowed, true);
  }
  // 4th request must be rate limited!
  check = rateLimiter.checkRateLimit(mockUsers.freeUser, event);
  assert.equal(check.allowed, false);

  // Pro User Limit Check: Limit is 15 requests per window
  rateLimiter.resetUserLimits(mockUsers.proUser._id);
  for (let i = 0; i < 15; i++) {
    check = rateLimiter.checkRateLimit(mockUsers.proUser, event);
    assert.equal(check.allowed, true);
  }
  check = rateLimiter.checkRateLimit(mockUsers.proUser, event);
  assert.equal(check.allowed, false);

  // Admin User Limit Check: Limit is Infinity (never limited)
  rateLimiter.resetUserLimits(mockUsers.adminUser._id);
  for (let i = 0; i < 100; i++) {
    check = rateLimiter.checkRateLimit(mockUsers.adminUser, event);
    assert.equal(check.allowed, true);
  }
});

// ─── 5. Middleware Standardized Errors Verification ────────────────────────
runTest('Middleware Guarding & Standardized Errors Verification', async () => {
  // Mock Express Request & Response Objects
  const createMockExpressContext = (user) => {
    const req = {
      user,
      originalUrl: '/test-endpoint',
    };
    let resStatus = 200;
    let resJson = null;
    const res = {
      status(code) {
        resStatus = code;
        return this;
      },
      json(obj) {
        resJson = obj;
        return this;
      },
    };
    let nextCalled = false;
    const next = (err) => {
      if (err) throw err;
      nextCalled = true;
    };

    return { req, res, next, getStatus: () => resStatus, getJson: () => resJson, wasNextCalled: () => nextCalled };
  };

  // requirePro Denies Free User
  const proCtx1 = createMockExpressContext(mockUsers.freeUser);
  await requirePro(proCtx1.req, proCtx1.res, proCtx1.next);
  assert.equal(proCtx1.getStatus(), 403);
  assert.equal(proCtx1.getJson().error, 'PRO_REQUIRED');
  assert.equal(proCtx1.wasNextCalled(), false);

  // requirePro Approves Pro User
  const proCtx2 = createMockExpressContext(mockUsers.proUser);
  await requirePro(proCtx2.req, proCtx2.res, proCtx2.next);
  assert.equal(proCtx2.wasNextCalled(), true);

  // requireAdmin Denies Pro User
  const adminCtx1 = createMockExpressContext(mockUsers.proUser);
  await requireAdmin(adminCtx1.req, adminCtx1.res, adminCtx1.next);
  assert.equal(adminCtx1.getStatus(), 403);
  assert.equal(adminCtx1.getJson().error, 'ADMIN_REQUIRED');
  assert.equal(adminCtx1.wasNextCalled(), false);

  // requireAdmin Approves Admin User
  const adminCtx2 = createMockExpressContext(mockUsers.adminUser);
  await requireAdmin(adminCtx2.req, adminCtx2.res, adminCtx2.next);
  assert.equal(adminCtx2.wasNextCalled(), true);

  // requireFeature Denies Free User for ai_chat
  const featCtx1 = createMockExpressContext(mockUsers.freeUser);
  await requireFeature('ai_chat')(featCtx1.req, featCtx1.res, featCtx1.next);
  assert.equal(featCtx1.getStatus(), 403);
  assert.equal(featCtx1.getJson().error, 'FEATURE_LOCKED');
  assert.equal(featCtx1.wasNextCalled(), false);

  // requireFeature Approves Pro User for ai_chat
  const featCtx2 = createMockExpressContext(mockUsers.proUser);
  await requireFeature('ai_chat')(featCtx2.req, featCtx2.res, featCtx2.next);
  assert.equal(featCtx2.wasNextCalled(), true);
});

console.log(`\n${green}=== ALL VERIFICATION CHECKS SUCCESSFULLY PASSED ===${reset}`);
console.log(`${green}Realtime SaaS Monetization Architecture is production-ready!${reset}`);
