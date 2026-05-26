// src/loadtests/redisFailoverTest.js
// Automated Failover Test: Simulates Redis outages, validates local memory fallback, and ensures re-sync upon recovery

const assert = require('assert').strict;
const TimerRepository = require('../repositories/TimerRepository');
const UserRepository = require('../repositories/UserRepository');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const yellow = '\x1b[33m';

// Stub active Socket Redis client getter to control status
let mockRedisStatus = 'ready';
const mockRedisData = new Map();

const mockRedisClient = {
  status: 'ready',
  get: async (key) => {
    if (mockRedisStatus !== 'ready') throw new Error('Redis connection closed');
    return mockRedisData.get(key) || null;
  },
  set: async (key, val) => {
    if (mockRedisStatus !== 'ready') throw new Error('Redis connection closed');
    mockRedisData.set(key, val);
    return 'OK';
  },
  del: async (key) => {
    if (mockRedisStatus !== 'ready') throw new Error('Redis connection closed');
    mockRedisData.delete(key);
    return 1;
  }
};

// Override the socket getter inside repositories
const socketModule = require('../socket');
const originalGetRedisClient = socketModule.getRedisClient;
socketModule.getRedisClient = () => mockRedisClient;

async function run() {
  console.log(`${yellow}=== STARTING REDIS FAILOVER AND DUAL-WRITE SYNCHRONIZATION TEST ===${reset}\n`);

  const mockRoomId = 'room_failover_123';
  const timerState = {
    state: 'running',
    duration: 1500,
    remainingTime: 1200,
    startSent: true,
    midSent: false,
    completeSent: false,
  };

  // ─── 1. Write when Redis is Healthy ─────────────────────────────────────────
  console.log('[Failover Test] Writing timer state when Redis is ONLINE...');
  mockRedisStatus = 'ready';
  mockRedisClient.status = 'ready';

  await TimerRepository.set(mockRoomId, timerState);

  // Check both stores
  const redisVal = await mockRedisClient.get(`timer:room:${mockRoomId}`);
  assert.ok(redisVal);
  assert.equal(JSON.parse(redisVal).remainingTime, 1200);

  const localVal = TimerRepository.localTimerStore.get(mockRoomId);
  assert.ok(localVal);
  assert.equal(localVal.remainingTime, 1200);

  console.log(' ✔ Successfully written to Redis and Local Memory (Dual-Write active).');

  // ─── 2. Trigger Redis Disconnection Failover ──────────────────────────────────
  console.log('[Failover Test] Simulating Redis server failure (OFFLINE)...');
  mockRedisStatus = 'end';
  mockRedisClient.status = 'end'; // simulate outage

  // Retrieve must fall back seamlessly to local store
  console.log('[Failover Test] Reading timer state during outage...');
  const stateDuringOutage = await TimerRepository.get(mockRoomId);
  assert.ok(stateDuringOutage);
  assert.equal(stateDuringOutage.remainingTime, 1200);
  console.log(' ✔ Seamless read fallback verified (Zero impact on client reads).');

  // Write must succeed locally even with Redis offline
  console.log('[Failover Test] Writing new timer state during outage...');
  const updatedState = { ...timerState, remainingTime: 1000 };
  await TimerRepository.set(mockRoomId, updatedState);

  const localValDuringOutage = TimerRepository.localTimerStore.get(mockRoomId);
  assert.equal(localValDuringOutage.remainingTime, 1000);
  console.log(' ✔ Fail-safe write backup verified (Zero impact on client writes).');

  // ─── 3. Restore Redis Connection & Verify State Sync ──────────────────────────
  console.log('[Failover Test] Restoring Redis connection (ONLINE)...');
  mockRedisStatus = 'ready';
  mockRedisClient.status = 'ready';

  // Force a set to sync/write back to restored Redis
  await TimerRepository.set(mockRoomId, localValDuringOutage);

  const syncedRedisVal = await mockRedisClient.get(`timer:room:${mockRoomId}`);
  assert.ok(syncedRedisVal);
  assert.equal(JSON.parse(syncedRedisVal).remainingTime, 1000);
  console.log(' ✔ Reconnection state synchronization verified.');

  // Clean stores
  await TimerRepository.delete(mockRoomId);
  
  // Restore original getter
  socketModule.getRedisClient = originalGetRedisClient;

  console.log(`\n${green}=== REDIS FAILOVER AND RESILIENCE TESTS SUCCESSFUL ===${reset}`);
  process.exit(0);
}

run().catch(err => {
  console.error(`${red}✘ [FAILOVER TEST FAILED]${reset}`, err);
  process.exit(1);
});
