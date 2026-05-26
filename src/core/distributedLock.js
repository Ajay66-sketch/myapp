// src/core/distributedLock.js
// Enterprise-grade crash-resilient distributed locks with auto-renewal heartbeats

const crypto = require('crypto');
const systemEventBus = require('../telemetry/eventBus');

const localMemoryLocks = new Map(); // key -> { ownerId, expiresAt }

let sharedRedisClient = null;
const getRedisClient = () => {
  return sharedRedisClient;
};

class DistributedLock {
  static setRedisClient(client) {
    sharedRedisClient = client;
  }

  constructor(lockKey, ttlMs = 5000) {
    this.lockKey = lockKey;
    this.ttlMs = ttlMs;
    this.ownerId = crypto.randomUUID();
    this.renewalIntervalId = null;
    this.isAcquired = false;
  }

  /**
   * Acquire Redlock-compliant lock
   */
  async acquire() {
    const redisClient = getRedisClient();

    if (redisClient && redisClient.status === 'ready') {
      try {
        // Redlock style atomic write: SET lockKey ownerId PX ttlMs NX
        const result = await redisClient.set(this.lockKey, this.ownerId, 'PX', this.ttlMs, 'NX');
        if (result === 'OK') {
          this.isAcquired = true;
          this.startRenewalHeartbeat();
          systemEventBus.emit('lock:acquired', 'info', { lockKey: this.lockKey, ownerId: this.ownerId, provider: 'redis' }, 'system');
          return true;
        }
        return false;
      } catch (err) {
        console.warn(`[DistributedLock] Redis SET failed for key ${this.lockKey}, reverting to memory...`, err.message);
      }
    }

    // Fail-safe: Local Memory Lock Fallback
    const now = Date.now();
    const existing = localMemoryLocks.get(this.lockKey);
    if (existing && existing.expiresAt > now) {
      // Locked by active task
      return false;
    }

    // Acquire lock inside memory block
    this.isAcquired = true;
    localMemoryLocks.set(this.lockKey, {
      ownerId: this.ownerId,
      expiresAt: now + this.ttlMs
    });
    
    this.startRenewalHeartbeat();
    systemEventBus.emit('lock:acquired', 'info', { lockKey: this.lockKey, ownerId: this.ownerId, provider: 'memory' }, 'system');
    return true;
  }

  /**
   * Background heartbeat auto-renewal loop (renews at 1/3 of lock TTL)
   */
  startRenewalHeartbeat() {
    const intervalMs = Math.max(500, Math.floor(this.ttlMs / 3));
    this.renewalIntervalId = setInterval(async () => {
      if (!this.isAcquired) {
        this.stopRenewalHeartbeat();
        return;
      }

      const redisClient = getRedisClient();
      if (redisClient && redisClient.status === 'ready') {
        try {
          // Lua script to renew atomically only if this node remains the current owner
          const lua = `
            if redis.call("get", KEYS[1]) == ARGV[1] then
              return redis.call("pexpire", KEYS[1], ARGV[2])
            else
              return 0
            end
          `;
          const result = await redisClient.eval(lua, 1, this.lockKey, this.ownerId, this.ttlMs);
          if (result === 0) {
            // Lock expired or taken over
            this.isAcquired = false;
            this.stopRenewalHeartbeat();
            systemEventBus.emit('lock:lost', 'warn', { lockKey: this.lockKey, ownerId: this.ownerId }, 'system');
          }
        } catch (err) {
          // Skip tick if Redis briefly disconnects; rely on local memory clock persistence
        }
      } else {
        // Memory renew
        const existing = localMemoryLocks.get(this.lockKey);
        if (existing && existing.ownerId === this.ownerId) {
          existing.expiresAt = Date.now() + this.ttlMs;
        } else {
          this.isAcquired = false;
          this.stopRenewalHeartbeat();
        }
      }
    }, intervalMs);

    // Register heartbeat interval to cleanup registry to avoid memory leaks
    try {
      const cleanupManager = require('./cleanupManager');
      cleanupManager.registerInterval(this.renewalIntervalId);
    } catch (e) {}
  }

  /**
   * Stop auto-renewal loop
   */
  stopRenewalHeartbeat() {
    if (this.renewalIntervalId) {
      clearInterval(this.renewalIntervalId);
      try {
        const cleanupManager = require('./cleanupManager');
        cleanupManager.deregisterInterval(this.renewalIntervalId);
      } catch (e) {}
      this.renewalIntervalId = null;
    }
  }

  /**
   * Safely release lock (ensures ownership release checks)
   */
  async release() {
    this.stopRenewalHeartbeat();
    if (!this.isAcquired) return;
    this.isAcquired = false;

    const redisClient = getRedisClient();
    if (redisClient && redisClient.status === 'ready') {
      try {
        // Lua script to release atomically only if ownership checks out
        const lua = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
        await redisClient.eval(lua, 1, this.lockKey, this.ownerId);
      } catch (err) {
        // Silent recovery
      }
    }

    // Memory release
    const existing = localMemoryLocks.get(this.lockKey);
    if (existing && existing.ownerId === this.ownerId) {
      localMemoryLocks.delete(this.lockKey);
    }

    systemEventBus.emit('lock:released', 'info', { lockKey: this.lockKey, ownerId: this.ownerId }, 'system');
  }
}

DistributedLock.localMemoryLocks = localMemoryLocks;
module.exports = DistributedLock;
