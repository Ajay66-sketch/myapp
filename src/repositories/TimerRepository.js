// src/repositories/TimerRepository.js
// Handles distributed timer persistence with Redis primary storage, memory fallback, Zod validation, and telemetry

const { validate, timerPayloadSchema } = require('../validation/schemas');
const systemEventBus = require('../telemetry/eventBus');

const localTimerStore = new Map();

const getRedisClient = () => {
  try {
    return require('../socket').getRedisClient();
  } catch (err) {
    return null;
  }
};

/**
 * Retrieve focus timer state for a room
 * @param {string} roomId 
 * @returns {Promise<object|null>}
 */
async function get(roomId) {
  if (!roomId) return null;
  const idStr = roomId.toString();
  const redisClient = getRedisClient();

  if (redisClient && redisClient.status === 'ready') {
    try {
      const dataStr = await redisClient.get(`timer:room:${idStr}`);
      if (dataStr) {
        systemEventBus.emit('repository:hit', 'info', { repository: 'TimerRepository', key: idStr, source: 'redis' }, 'system');
        return JSON.parse(dataStr);
      }
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'TimerRepository', operation: 'get:redis', error: err.message }, 'system');
    }
  }

  // Memory fallback
  const memoryState = localTimerStore.get(idStr) || null;
  if (memoryState) {
    systemEventBus.emit('repository:hit', 'info', { repository: 'TimerRepository', key: idStr, source: 'memory' }, 'system');
  }
  return memoryState;
}

/**
 * Persist focus timer state
 * @param {string} roomId 
 * @param {object} timerState 
 * @param {number} [ttlSeconds] 
 */
async function set(roomId, timerState, ttlSeconds = 86400) {
  if (!roomId) return;
  const idStr = roomId.toString();
  
  try {
    // Validate schema before save
    const validatedState = validate(timerPayloadSchema, timerState, 'TimerState');

    const redisClient = getRedisClient();
    if (redisClient && redisClient.status === 'ready') {
      try {
        await redisClient.set(
          `timer:room:${idStr}`,
          JSON.stringify(validatedState),
          'EX',
          ttlSeconds
        );
        systemEventBus.emit('repository:write', 'info', { repository: 'TimerRepository', operation: 'set', roomId: idStr, source: 'redis' }, 'system');
      } catch (err) {
        systemEventBus.emit('repository:error', 'warn', { repository: 'TimerRepository', operation: 'set:redis', error: err.message }, 'system');
      }
    }

    // Always keep in-sync locally as backup / failover fallback
    localTimerStore.set(idStr, validatedState);
    systemEventBus.emit('repository:write', 'info', { repository: 'TimerRepository', operation: 'set', roomId: idStr, source: 'memory' }, 'system');
  } catch (err) {
    systemEventBus.emit('repository:error', 'error', { repository: 'TimerRepository', operation: 'set', error: err.message }, 'system');
    throw err;
  }
}

/**
 * Delete focus timer state
 * @param {string} roomId 
 */
async function del(roomId) {
  if (!roomId) return;
  const idStr = roomId.toString();
  const redisClient = getRedisClient();

  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.del(`timer:room:${idStr}`);
      systemEventBus.emit('repository:delete', 'info', { repository: 'TimerRepository', roomId: idStr, source: 'redis' }, 'system');
    } catch (err) {
      systemEventBus.emit('repository:error', 'warn', { repository: 'TimerRepository', operation: 'delete:redis', error: err.message }, 'system');
    }
  }

  localTimerStore.delete(idStr);
  systemEventBus.emit('repository:delete', 'info', { repository: 'TimerRepository', roomId: idStr, source: 'memory' }, 'system');
}

module.exports = {
  get,
  set,
  delete: del,
  localTimerStore
};
