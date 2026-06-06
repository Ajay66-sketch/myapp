// src/config/redisEventBridge.js
// Central Event Bridge translating raw Redis client events to telemetry systemEventBus events.
// Enforces that NO other file in the application directly subscribes to raw Redis client events.

const systemEventBus = require('../telemetry/eventBus');

let bridgeAttached = false;

/**
 * Attaches connection lifecycle event listeners exactly ONCE to the singleton Redis client.
 * Translates Redis events to global systemEventBus notifications.
 */
function initRedisEventBridge(client) {
  if (bridgeAttached) {
    return;
  }
  bridgeAttached = true;

  console.log('[Redis Event Bridge] Centralizing connection lifecycle listeners...');

  client.on('ready', () => {
    console.log('   ✅ [Redis Event Bridge] Connection established and operational (READY)');
    systemEventBus.emit('infra:redis:state', 'info', { status: 'UP' });
    
    // Broadcast decoupled ready event through the system event bus
    systemEventBus.emit('redis:ready', 'info', { status: 'ready' });
  });

  client.on('close', () => {
    console.warn('   ⚠️ [Redis Event Bridge] Connection closed (CLOSE)');
    systemEventBus.emit('infra:redis:state', 'warn', { status: 'DOWN' });
    
    // Broadcast decoupled down event through the system event bus
    systemEventBus.emit('redis:down', 'warn', { status: 'close' });
  });

  client.on('error', (err) => {
    console.error(`   ❌ [Redis Event Bridge] Error event: ${err.message}`);
    
    // Maintain connection status tracking for failover control
    if (err.code === 'ECONNREFUSED' || client.status !== 'ready') {
      systemEventBus.emit('infra:redis:state', 'warn', { status: 'DOWN' });
    }
    
    // Broadcast decoupled error event through the system event bus
    systemEventBus.emit('redis:error', 'error', { message: err.message });
  });
}

module.exports = { initRedisEventBridge };
