// src/loadtests/timerConsistencyTest.js
// Timer Consistency Test: Validates distributed locking, ticking race condition prevention, and gamification rewards

const assert = require('assert').strict;
const DistributedLock = require('../core/distributedLock');
const TimerRepository = require('../repositories/TimerRepository');
const UserStatsRepository = require('../repositories/UserStatsRepository');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const yellow = '\x1b[33m';

// Mock active Redis status and key maps
let mockRedisStatus = 'ready';
const mockRedisData = new Map();

const mockRedisClient = {
  status: 'ready',
  get: async (key) => {
    if (mockRedisStatus !== 'ready') throw new Error('Redis connection closed');
    return mockRedisData.get(key) || null;
  },
  set: async (key, val, pxOption, ttl, nxOption) => {
    if (mockRedisStatus !== 'ready') throw new Error('Redis connection closed');
    // Emulate Redis lock NX options
    if (nxOption === 'NX' || pxOption === 'NX') {
      if (mockRedisData.has(key)) return null;
    }
    mockRedisData.set(key, val);
    return 'OK';
  },
  del: async (key) => {
    if (mockRedisStatus !== 'ready') throw new Error('Redis connection closed');
    mockRedisData.delete(key);
    return 1;
  },
  eval: async (script, numKeys, key, ownerId, ttl) => {
    // Basic Lua engine emulation for release/renewal
    if (script.includes('del')) {
      if (mockRedisData.get(key) === ownerId) {
        mockRedisData.delete(key);
        return 1;
      }
      return 0;
    }
    if (script.includes('pexpire')) {
      if (mockRedisData.get(key) === ownerId) {
        return 1;
      }
      return 0;
    }
    return 0;
  }
};

// Override the socket getter inside core locks and repositories
const socketModule = require('../socket');
const originalGetRedisClient = socketModule.getRedisClient;
socketModule.getRedisClient = () => mockRedisClient;

async function run() {
  DistributedLock.setRedisClient(mockRedisClient);
  console.log(`${yellow}=== STARTING TIMER LOCK CONSISTENCY AND REWARDS DOUBLE-SPEND TEST ===${reset}\n`);

  const roomId = 'room_lock_consistency_123';
  const lockKey = `lock:timer:${roomId}`;

  // ─── 1. Verify Locks Prevent Concurrent Lock Acquisitions ───────────────────
  console.log('[Consistency Test] Attempting concurrent lock acquisition...');

  const lock1 = new DistributedLock(lockKey, 1000);
  const lock2 = new DistributedLock(lockKey, 1000);

  const lock1Acquired = await lock1.acquire();
  const lock2Acquired = await lock2.acquire();

  assert.equal(lock1Acquired, true);
  assert.equal(lock2Acquired, false); // Blocked because lock1 holds it!

  console.log(' ✔ Verified that dual-ticking is blocked by the distributed lock.');

  // Release lock 1
  await lock1.release();
  
  // Now lock 2 should be able to acquire
  const lock2AcquiredAfterRelease = await lock2.acquire();
  assert.equal(lock2AcquiredAfterRelease, true);
  
  await lock2.release();
  console.log(' ✔ Verified lock release cycles.');

  // ─── 2. Verify Gamification Rewards Double-Spend Mitigation ────────────────
  console.log('[Consistency Test] Simulating user gamification award cycles...');
  
  const userId = 'user_consistency_456';
  
  // Seed user stats
  const UserRepository = require('../repositories/UserRepository');
  const mockUser = {
    _id: userId,
    username: 'lock_student',
    stats: {
      totalFocusMinutes: 0
    }
  };
  
  // Stub get/update on UserRepository to prevent MongoDB hits in test
  const originalGet = UserRepository.get;
  const originalUpdate = UserRepository.update;
  
  UserRepository.get = async () => mockUser;
  UserRepository.update = async (id, data) => {
    Object.assign(mockUser, data);
    return mockUser;
  };

  // Run increment operations in rapid succession
  console.log('[Consistency Test] Triggering concurrent stats updates...');
  await Promise.all([
    UserStatsRepository.incrementFocusMinutes(userId, 25),
    UserStatsRepository.incrementFocusMinutes(userId, 25),
    UserStatsRepository.incrementFocusMinutes(userId, 25),
  ]);

  // Total must be 75
  assert.equal(mockUser.stats.totalFocusMinutes, 75);
  console.log(' ✔ Verified atomic sequential increments (Final focus: 75 minutes).');

  // Restore stubs
  UserRepository.get = originalGet;
  UserRepository.update = originalUpdate;
  socketModule.getRedisClient = originalGetRedisClient;
  DistributedLock.setRedisClient(null);

  console.log(`\n${green}=== TIMER CONSISTENCY AND LOCK CHECKS SUCCESSFUL ===${reset}`);
  process.exit(0);
}

run().catch(err => {
  console.error(`${red}✘ [TIMER CONSISTENCY TEST FAILED]${reset}`, err);
  process.exit(1);
});
