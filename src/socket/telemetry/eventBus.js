// src/socket/telemetry/eventBus.js
// Bridges local event backbone events over to the system audit logging telemetry Event Bus

const coreEventBus = require('../../core/eventBus');
const systemEventBus = require('../../telemetry/eventBus');

coreEventBus.on('timer:start', ({ roomId, duration, userId }) => {
  systemEventBus.emit('timer:start', 'info', { roomId, duration }, userId);
});

coreEventBus.on('timer:pause', ({ roomId, userId }) => {
  systemEventBus.emit('timer:pause', 'warn', { roomId }, userId);
});

coreEventBus.on('timer:resume', ({ roomId, userId }) => {
  systemEventBus.emit('timer:resume', 'info', { roomId }, userId);
});

coreEventBus.on('timer:cancel', ({ roomId, userId }) => {
  systemEventBus.emit('timer:cancel', 'warn', { roomId }, userId);
});

coreEventBus.on('timer:complete', ({ roomId, timer }) => {
  systemEventBus.emit('timer:complete', 'info', { roomId, duration: timer.duration }, 'system');
});

coreEventBus.on('socket:disconnect', ({ socket, userId, username }) => {
  systemEventBus.emit('socket:disconnect', 'info', { socketId: socket.id, username }, userId);
});

coreEventBus.on('ai:tutor_motivation', ({ roomId, message }) => {
  systemEventBus.emit('ai:tutor_motivation', 'info', { roomId, message }, 'ai_tutor_system');
});

module.exports = {};
