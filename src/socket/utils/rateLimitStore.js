// src/socket/utils/rateLimitStore.js
// In-memory rate limiting store for Socket.IO events
// Lightweight, low-latency alternative to Redis for rate limiting

class RateLimitStore {
  constructor() {
    // Format: { 'key:subkey': { count, resetAt, limit } }
    this.store = new Map();
    
    // Cleanup interval: remove expired entries every 10 seconds
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 10000);
  }

  /**
   * Get or create rate limit entry
   * @param {string} key - Rate limit key (e.g., 'user:123:room:join')
   * @param {number} limit - Max requests allowed in window
   * @param {number} windowMs - Time window in milliseconds (default 60s)
   * @returns {object} Rate limit entry
   */
  _getEntry(key, limit, windowMs = 60000) {
    if (!this.store.has(key)) {
      this.store.set(key, {
        count: 0,
        resetAt: Date.now() + windowMs,
        limit,
        windowMs,
      });
    }

    const entry = this.store.get(key);

    // Reset counter if window expired
    if (Date.now() >= entry.resetAt) {
      entry.count = 0;
      entry.resetAt = Date.now() + entry.windowMs;
    }

    return entry;
  }

  /**
   * Check if request allowed and increment counter
   * @param {string} key - Rate limit key
   * @param {number} limit - Max requests per window (default 10)
   * @param {number} windowMs - Time window in milliseconds (default 60s)
   * @returns {object} { allowed: boolean, count: number, remaining: number, resetIn: number }
   */
  check(key, limit = 10, windowMs = 60000) {
    const entry = this._getEntry(key, limit, windowMs);
    const now = Date.now();
    const resetIn = Math.max(0, entry.resetAt - now);

    if (entry.count >= entry.limit) {
      return {
        allowed: false,
        count: entry.count,
        remaining: 0,
        resetIn,
        limit,
      };
    }

    // Increment and allow
    entry.count++;

    return {
      allowed: true,
      count: entry.count,
      remaining: entry.limit - entry.count,
      resetIn,
      limit,
    };
  }

  /**
   * Increment counter without checking limit
   * @param {string} key - Rate limit key
   * @param {number} limit - Max requests per window (default 10)
   * @param {number} windowMs - Time window in milliseconds (default 60s)
   * @returns {number} Current count
   */
  increment(key, limit = 10, windowMs = 60000) {
    const entry = this._getEntry(key, limit, windowMs);
    entry.count++;
    return entry.count;
  }

  /**
   * Get current usage without incrementing
   * @param {string} key - Rate limit key
   * @returns {object} { count: number, limit: number, remaining: number }
   */
  getUsage(key) {
    const entry = this.store.get(key);
    
    if (!entry) {
      return { count: 0, limit: 0, remaining: 0 };
    }

    // Check if window expired
    if (Date.now() >= entry.resetAt) {
      return { count: 0, limit: entry.limit, remaining: entry.limit };
    }

    return {
      count: entry.count,
      limit: entry.limit,
      remaining: Math.max(0, entry.limit - entry.count),
    };
  }

  /**
   * Reset counter for a key
   * @param {string} key - Rate limit key
   */
  reset(key) {
    this.store.delete(key);
  }

  /**
   * Reset all counters for a user (e.g., on disconnect)
   * @param {string} userId - User ID
   */
  resetUser(userId) {
    const prefix = `user:${userId}:`;
    
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Remove expired entries from store
   * Called automatically every 10 seconds
   */
  cleanup() {
    const now = Date.now();

    for (const [key, entry] of this.store.entries()) {
      // Remove if window expired and count is 0 (safe to remove)
      if (now >= entry.resetAt && entry.count === 0) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Get store size (for monitoring)
   * @returns {number} Number of active keys
   */
  size() {
    return this.store.size;
  }

  /**
   * Destroy the store and clear interval
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// Export singleton instance
module.exports = new RateLimitStore();
