// src/loadtests/reconnectStormTest.js
// Reconnect Storm Test: Simulates high-velocity reconnection spikes, rate-limit defenses, and memory stability

const assert = require('assert').strict;
const rateLimiter = require('../socket/rateLimiter');
const config = require('../socket/config');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const yellow = '\x1b[33m';

async function run() {
  console.log(`${yellow}=== STARTING RECONNECT STORM AND CONNECTION THROTTLING TEST ===${reset}\n`);

  const mockUser = {
    _id: 'user_storm_123',
    tier: 'free'
  };

  const initialMemory = process.memoryUsage().heapUsed;
  const numConnections = 20;

  console.log(`[Storm Test] Simulating ${numConnections} connection attempts in under 100ms...`);

  // Clear rate limits to start fresh
  const rateLimitStore = require('../socket/utils/rateLimitStore');
  rateLimitStore.clearAll?.();

  const results = [];
  const start = Date.now();

  // Fire concurrent identify checks
  for (let i = 0; i < numConnections; i++) {
    // client:reauth rate limit check
    results.push(rateLimiter.checkRateLimit(mockUser, 'socket:reauth'));
  }

  const resolved = await Promise.all(results);
  const elapsed = Date.now() - start;

  const allowedCount = resolved.filter(r => r.allowed).length;
  const blockedCount = resolved.filter(r => !r.allowed).length;

  console.log(` ✔ Finished executing storm in ${elapsed}ms.`);
  console.log(` - Allowed connections: ${allowedCount}`);
  console.log(` - Blocked/Throttled attempts: ${blockedCount}`);

  // Confirm rate-limiter throttled the storm
  const limitDef = config.RATE_LIMITS['socket:reauth'];
  assert.ok(allowedCount <= limitDef.limit);
  assert.ok(blockedCount > 0);

  console.log(` ✔ Verified rate-limiter throttled ${blockedCount} requests (Security defenses active).`);

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryDeltaMb = Math.round((finalMemory - initialMemory) / 1024 / 1024 * 100) / 100;
  console.log(` - Memory footprint delta: +${memoryDeltaMb} MB`);

  console.log(`\n${green}=== RECONNECT STORM TEST SUCCESSFUL ===${reset}`);
  process.exit(0);
}

run().catch(err => {
  console.error(`${red}✘ [RECONNECT STORM TEST FAILED]${reset}`, err);
  process.exit(1);
});
