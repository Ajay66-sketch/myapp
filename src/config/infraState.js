// src/config/infraState.js
// Authorized global System of Record for the Redis and Queue infrastructures status.
// Serves as the single source of truth for deterministic self-healing loops.

global.__INFRA_STATE = global.__INFRA_STATE || {
  redis: {
    status: "DOWN", // READY | DOWN | DEGRADED
    lastHeartbeat: 0,
    version: 0
  },
  queue: {
    status: "DISABLED", // ACTIVE | DEGRADED | DISABLED
    lastCheck: 0,
    activeConnections: 0
  }
};

module.exports = global.__INFRA_STATE;
