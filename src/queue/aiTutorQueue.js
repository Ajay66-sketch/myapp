// src/queue/aiTutorQueue.js
// Asynchronously processes AI Tutor motivational prompts and chat persists

const ResilientQueue = require('./baseQueue');
const roomStore = require('../utils/roomStore');

const getIO = () => {
  try {
    return require('../socket').getIO();
  } catch (e) {
    return null;
  }
};

const aiTutorQueue = new ResilientQueue('ai-tutor-milestones', async (jobData) => {
  const { roomId, type, message } = jobData;
  
  // 1. Broadcast over Socket.io
  const io = getIO();
  if (io) {
    if (type === 'motivation') {
      io.to(`room:${roomId}`).emit('room:activity', {
        type: 'chat',
        username: '🤖 AI Tutor',
        userId: 'ai_tutor_system',
        message: message,
        timestamp: Date.now()
      });
    } else {
      io.to(`room:${roomId}`).emit('ai:tutor_message', {
        roomId,
        type,
        message,
        timestamp: Date.now()
      });
    }
  }

  // 2. Persist message in room store
  await roomStore.createMessage({
    roomId,
    userId: 'ai_tutor_system',
    username: '🤖 AI Tutor',
    message,
    type: 'chat'
  });
});

module.exports = aiTutorQueue;
