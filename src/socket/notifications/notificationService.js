// src/socket/notifications/notificationService.js
// Handles creation of persistent system notifications and break alerts for focus mode events

const coreEventBus = require('../../core/eventBus');
const presenceService = require('../presence/presenceService');
const notificationService = require('../../services/notificationService');

const getIO = () => require('../../socket').getIO();

// Subscribe to timer state events
coreEventBus.on('timer:start', handleTimerStart);
coreEventBus.on('timer:pause', handleTimerPause);
coreEventBus.on('timer:resume', handleTimerResume);
coreEventBus.on('timer:cancel', handleTimerCancel);
coreEventBus.on('timer:complete', handleTimerComplete);

async function handleTimerStart({ roomId, duration, userId }) {
  const io = getIO();
  try {
    const roomSockets = io.sockets.adapter.rooms.get(`room:${roomId}`) || io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const sId of roomSockets) {
        const u = presenceService.onlineUsers.get(sId);
        if (u && u.userId) {
          await notificationService.createNotification({
            userId: u.userId,
            type: 'system',
            title: 'Study Focus Session Started! ⏱️',
            message: `Your room started a ${duration / 60}-minute focus sprint. Let's do this!`,
          });
        }
      }
    }
  } catch (err) {
    console.error('[NotificationService timer:start err]:', err.message);
  }
}

async function handleTimerPause({ roomId, userId }) {
  const io = getIO();
  try {
    let triggeringUsername = 'Someone';
    const activeUser = Array.from(presenceService.onlineUsers.values()).find(u => u.userId === userId);
    if (activeUser) triggeringUsername = activeUser.username;

    const roomSockets = io.sockets.adapter.rooms.get(`room:${roomId}`) || io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const sId of roomSockets) {
        const u = presenceService.onlineUsers.get(sId);
        if (u && u.userId) {
          await notificationService.createNotification({
            userId: u.userId,
            type: 'system',
            title: 'Focus Session Paused ⏸️',
            message: `${triggeringUsername} paused the study sprint.`,
          });
        }
      }
    }
  } catch (err) {
    console.error('[NotificationService timer:pause err]:', err.message);
  }
}

async function handleTimerResume({ roomId, userId }) {
  const io = getIO();
  try {
    let triggeringUsername = 'Someone';
    const activeUser = Array.from(presenceService.onlineUsers.values()).find(u => u.userId === userId);
    if (activeUser) triggeringUsername = activeUser.username;

    const roomSockets = io.sockets.adapter.rooms.get(`room:${roomId}`) || io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const sId of roomSockets) {
        const u = presenceService.onlineUsers.get(sId);
        if (u && u.userId) {
          await notificationService.createNotification({
            userId: u.userId,
            type: 'system',
            title: 'Focus Session Resumed ▶️',
            message: `${triggeringUsername} resumed the study sprint.`,
          });
        }
      }
    }
  } catch (err) {
    console.error('[NotificationService timer:resume err]:', err.message);
  }
}

async function handleTimerCancel({ roomId, userId }) {
  const io = getIO();
  try {
    let triggeringUsername = 'Someone';
    const activeUser = Array.from(presenceService.onlineUsers.values()).find(u => u.userId === userId);
    if (activeUser) triggeringUsername = activeUser.username;

    const roomSockets = io.sockets.adapter.rooms.get(`room:${roomId}`) || io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const sId of roomSockets) {
        const u = presenceService.onlineUsers.get(sId);
        if (u && u.userId) {
          await notificationService.createNotification({
            userId: u.userId,
            type: 'system',
            title: 'Focus Session Cancelled 🛑',
            message: `${triggeringUsername} cancelled the study sprint.`,
          });
        }
      }
    }
  } catch (err) {
    console.error('[NotificationService timer:cancel err]:', err.message);
  }
}

async function handleTimerComplete({ roomId, timer }) {
  const io = getIO();
  try {
    const roomSockets = io.sockets.adapter.rooms.get(`room:${roomId}`) || io.sockets.adapter.rooms.get(roomId);
    if (roomSockets) {
      for (const sId of roomSockets) {
        const u = presenceService.onlineUsers.get(sId);
        if (u && u.userId) {
          await notificationService.createNotification({
            userId: u.userId,
            type: 'system',
            title: 'Time for a break! ☕',
            message: `Your room completed the focus sprint! Take a well-deserved 5-minute break.`,
          });
        }
      }
    }
  } catch (err) {
    console.error('[NotificationService timer:complete err]:', err.message);
  }
}

module.exports = {};
