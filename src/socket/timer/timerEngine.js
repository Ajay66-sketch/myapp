// src/socket/timer/timerEngine.js
// Handles active ticker loops, Redis locking, and event emission for Pomodoro focus timers

const coreEventBus = require('../../core/eventBus');
const presenceService = require('../presence/presenceService');
const config = require('../config');

const getIO = () => require('../../socket').getIO();
const getRedisClient = () => {
  try {
    return require('../../config/redisClient').getRedisClient();
  } catch (err) {
    return null;
  }
};

const cleanupManager = require('../../core/cleanupManager');

// Start background room ticking interval immediately
const tickerIntervalId = setInterval(() => {
  tickAllRooms();
}, 1000);
cleanupManager.registerInterval(tickerIntervalId);

/**
 * Tick calculations across all active rooms with Redis Lock
 */
async function tickAllRooms() {
  const roomsState = presenceService.roomsState;
  const redisClient = getRedisClient();
  let io;
  try {
    io = getIO();
  } catch (err) {
    // Socket.io is not initialized yet (e.g. in test suites / bootstrapping), skip ticking
    return;
  }

  roomsState.forEach(async (room, roomId) => {
    // 1. Multi-node distributed lock to prevent duplicate ticking
    if (redisClient && redisClient.status === 'ready') {
      try {
        const lockKey = `lock:room:${roomId}`;
        const acquired = await redisClient.set(lockKey, 'locked', 'NX', 'EX', 2);
        if (acquired !== 'OK') {
          // Locked by another node, skip ticking on this node
          return;
        }
      } catch (err) {
        // Soft fallback to tick locally if locking fails
      }
    }

    let isCompletedNow = false;
    let isMidPointNow = false;

    // Ensure state flags are properly initialized
    if (room.timer.startSent === undefined) room.timer.startSent = false;
    if (room.timer.midSent === undefined) room.timer.midSent = false;
    if (room.timer.completeSent === undefined) room.timer.completeSent = false;

    // ─── Distributed Redis Syncer ─────────────────────────────────────────
    if (redisClient && redisClient.status === 'ready') {
      try {
        const redisStateStr = await redisClient.get(`timer:room:${roomId}`);
        if (redisStateStr) {
          const redisState = JSON.parse(redisStateStr);
          
          // Sync state flags from Redis
          room.timer.startSent = !!redisState.startSent;
          room.timer.midSent = !!redisState.midSent;
          room.timer.completeSent = !!redisState.completeSent;
          room.timer.lastMotivationalMin = redisState.lastMotivationalMin !== undefined ? redisState.lastMotivationalMin : null;

          if (redisState.state === 'running') {
            const remaining = Math.max(0, Math.ceil((redisState.endTime - Date.now()) / 1000));
            
            if (remaining === 0 && room.timer.state === 'running') {
              if (!room.timer.completeSent) {
                isCompletedNow = true;
                room.timer.state = 'completed';
                room.timer.remainingTime = 0;
                room.timer.completeSent = true;

                redisState.state = 'completed';
                redisState.completeSent = true;
                await redisClient.set(`timer:room:${roomId}`, JSON.stringify(redisState), 'EX', 10);
              }
            } else if (remaining > 0) {
              room.timer.state = 'running';
              room.timer.remainingTime = remaining;
              room.timer.duration = redisState.duration;

              // Check midpoint milestone
              if (!room.timer.midSent && remaining <= redisState.duration / 2) {
                isMidPointNow = true;
                room.timer.midSent = true;

                redisState.midSent = true;
                await redisClient.set(`timer:room:${roomId}`, JSON.stringify(redisState), 'EX', remaining + 10);
              }
            }
          } else if (redisState.state === 'paused') {
            room.timer.state = 'paused';
            room.timer.remainingTime = redisState.remainingTime;
            room.timer.duration = redisState.duration;
          }
        } else {
          if (room.timer.state === 'running') {
            room.timer.state = 'idle';
          }
        }
      } catch (err) {
        // Fallback silently
      }
    } else {
      // ─── Local In-Memory Syncer (Fallback) ──────────────────────────────
      if (room.timer.state === 'running' && room.timer.remainingTime > 0) {
        const remaining = Math.max(0, Math.ceil((room.timer.endTime - Date.now()) / 1000));
        room.timer.remainingTime = remaining;

        if (remaining === 0) {
          if (!room.timer.completeSent) {
            isCompletedNow = true;
            room.timer.state = 'completed';
            room.timer.completeSent = true;
          }
        } else {
          // Check midpoint milestone
          if (!room.timer.midSent && remaining <= room.timer.duration / 2) {
            isMidPointNow = true;
            room.timer.midSent = true;
          }
        }
      }
    }

    // Emit tick event on core event bus (listeners receive absolute state update)
    coreEventBus.emit('timer:tick', { roomId, timer: room.timer, isMidPointNow, isCompletedNow });

    // Sync state to all clients inside the room
    emitTimerSync(roomId, room.timer);

    if (isCompletedNow) {
      coreEventBus.emit('timer:complete', { roomId, timer: room.timer });
    }
  });
}

/**
 * Start a Pomodoro Focus Sprint
 */
async function startTimer(roomId, duration, userId) {
  const room = presenceService.roomsState.get(roomId);
  if (!room) throw new Error('Room not found');

  const { atomicTransition } = require('../../services/timerService');
  const res = await atomicTransition(roomId, 'start', { duration });
  
  if (res) {
    room.timer = res;
  } else {
    // Graceful Fallback: Local Memory Timer Mutation
    const endTime = Date.now() + duration * 1000;
    room.timer = {
      state: 'running',
      duration,
      remainingTime: duration,
      endTime,
      startSent: true,
      midSent: false,
      completeSent: false,
      lastMotivationalMin: null,
    };
  }

  coreEventBus.emit('timer:start', { roomId, duration, userId });
  emitTimerSync(roomId, room.timer);
}

/**
 * Pause Pomodoro timer
 */
async function pauseTimer(roomId, userId) {
  const room = presenceService.roomsState.get(roomId);
  if (!room) throw new Error('Room not found');

  const { atomicTransition } = require('../../services/timerService');
  const res = await atomicTransition(roomId, 'pause');

  if (res) {
    room.timer = res;
  } else {
    if (room.timer.state !== 'running') throw new Error('Cannot pause timer');
    room.timer.state = 'paused';
  }

  coreEventBus.emit('timer:pause', { roomId, userId });
  emitTimerSync(roomId, room.timer);
}

/**
 * Resume Pomodoro timer
 */
async function resumeTimer(roomId, userId) {
  const room = presenceService.roomsState.get(roomId);
  if (!room) throw new Error('Room not found');

  const { atomicTransition } = require('../../services/timerService');
  const res = await atomicTransition(roomId, 'resume');

  if (res) {
    room.timer = res;
  } else {
    if (room.timer.state !== 'paused') throw new Error('Cannot resume timer');
    const remaining = room.timer.remainingTime;
    const endTime = Date.now() + remaining * 1000;
    room.timer.state = 'running';
    room.timer.remainingTime = remaining;
    room.timer.endTime = endTime;
  }

  coreEventBus.emit('timer:resume', { roomId, userId });
  emitTimerSync(roomId, room.timer);
}

/**
 * Cancel Pomodoro timer
 */
async function cancelTimer(roomId, userId) {
  const room = presenceService.roomsState.get(roomId);
  if (!room) throw new Error('Room not found');

  const { atomicTransition } = require('../../services/timerService');
  await atomicTransition(roomId, 'cancel');

  room.timer.state = 'idle';
  room.timer.remainingTime = room.timer.duration;
  room.timer.startSent = false;
  room.timer.midSent = false;
  room.timer.completeSent = false;
  room.timer.lastMotivationalMin = null;

  coreEventBus.emit('timer:cancel', { roomId, userId });
  emitTimerSync(roomId, room.timer);
}

function emitTimerSync(roomId, timer) {
  try {
    getIO().to(`room:${roomId}`).emit(config.SERVER_EVENTS.TIMER_SYNC, timer);
  } catch (err) {
    // Graceful fallback during standalone tests
  }
}

module.exports = {
  startTimer,
  pauseTimer,
  resumeTimer,
  cancelTimer
};
