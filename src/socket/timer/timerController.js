// src/socket/timer/timerController.js
// Maps timer socket commands directly to the core timer engine

const timerEngine = require('./timerEngine');
const presenceService = require('../presence/presenceService');
const config = require('../config');

const getIO = () => require('../../socket').getIO();

/**
 * Handle timer start command
 */
async function handleStart(socket, data, ack) {
  const roomId = data.roomId;
  const duration = data.duration;

  await timerEngine.startTimer(roomId, duration, socket.data.userId);

  const user = presenceService.onlineUsers.get(socket.id);
  getIO().to(`room:${roomId}`).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
    type: 'system',
    message: `${user?.username || 'Someone'} started a ${duration / 60}-minute focus session.`,
  });

  ack?.({ success: true });
}

/**
 * Handle timer pause command
 */
async function handlePause(socket, data, ack) {
  const roomId = data.roomId;

  await timerEngine.pauseTimer(roomId, socket.data.userId);

  const user = presenceService.onlineUsers.get(socket.id);
  getIO().to(`room:${roomId}`).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
    type: 'system',
    message: `${user?.username || 'Someone'} paused the focus session.`,
  });

  ack?.({ success: true });
}

/**
 * Handle timer resume command
 */
async function handleResume(socket, data, ack) {
  const roomId = data.roomId;

  await timerEngine.resumeTimer(roomId, socket.data.userId);

  const user = presenceService.onlineUsers.get(socket.id);
  getIO().to(`room:${roomId}`).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
    type: 'system',
    message: `${user?.username || 'Someone'} resumed the focus session.`,
  });

  ack?.({ success: true });
}

/**
 * Handle timer cancel command
 */
async function handleCancel(socket, data, ack) {
  const roomId = data.roomId;

  await timerEngine.cancelTimer(roomId, socket.data.userId);

  const user = presenceService.onlineUsers.get(socket.id);
  getIO().to(`room:${roomId}`).emit(config.SERVER_EVENTS.ROOM_ACTIVITY, {
    type: 'system',
    message: `${user?.username || 'Someone'} cancelled the focus session.`,
  });

  ack?.({ success: true });
}

module.exports = {
  handleStart,
  handlePause,
  handleResume,
  handleCancel
};
