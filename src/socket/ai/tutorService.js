// src/socket/ai/tutorService.js
// Handles automatic AI Tutor milestone push notifications by delegating heavy tasks to aiTutorQueue

const coreEventBus = require('../../core/eventBus');
const aiTutorQueue = require('../../queue/aiTutorQueue');
const config = require('../config');

const getRedisClient = () => {
  try {
    return require('../../socket').getRedisClient();
  } catch (err) {
    return null;
  }
};

// Wire core event listeners
coreEventBus.on('timer:start', handleTimerStart);
coreEventBus.on('timer:tick', handleTimerTick);
coreEventBus.on('timer:complete', handleTimerComplete);

/**
 * START MILESTONE AI TRIGGER
 */
async function handleTimerStart({ roomId, duration, userId }) {
  try {
    const startText = "🚀 Let's get focused! A new Pomodoro sprint has officially started. Eliminate distractions and lock in.";
    
    // Delegate heavy broadcast and persistence task to the background queue
    await aiTutorQueue.add({
      roomId,
      type: 'start',
      message: startText
    });
  } catch (err) {
    console.error('[AI Tutor Start Milestone Error]:', err.message);
  }
}

/**
 * TICK & MIDPOINT MILESTONE AI TRIGGER
 */
async function handleTimerTick({ roomId, timer, isMidPointNow, isCompletedNow }) {
  const redisClient = getRedisClient();

  // 1. Midpoint check
  if (isMidPointNow) {
    const midText = "🎯 You've reached the halfway point! Take a deep breath, sit up straight, and keep that momentum going.";
    try {
      await aiTutorQueue.add({
        roomId,
        type: 'mid',
        message: midText
      });
    } catch (err) {
      console.error('[AI Tutor Midpoint Message Error]:', err.message);
    }
  }

  // 2. Periodic motivation prompt
  if (timer.state === 'running' && timer.remainingTime > 0) {
    const remainingMinutes = Math.floor(timer.remainingTime / 60);
    if (timer.remainingTime % 60 === 0 && timer.lastMotivationalMin !== remainingMinutes) {
      timer.lastMotivationalMin = remainingMinutes;

      // Update Redis atomic check
      if (redisClient && redisClient.status === 'ready') {
        try {
          const redisStateStr = await redisClient.get(`timer:room:${roomId}`);
          if (redisStateStr) {
            const redisState = JSON.parse(redisStateStr);
            redisState.lastMotivationalMin = remainingMinutes;
            await redisClient.set(`timer:room:${roomId}`, JSON.stringify(redisState), 'EX', timer.remainingTime + 10);
          }
        } catch (err) {}
      }

      const MOTIVATIONAL_PROMPTS = [
        "Focus is a muscle, and you are building it right now! Keep it up. 💪",
        "Great study habits are built one minute at a time. Stay locked in! 📚",
        "Remember to sit up straight and take a deep breath. You are doing amazing! 🧠",
        "Success is the sum of small focus efforts, repeated day in and day out. ⚡",
        "Your future self will thank you for the focus you're putting in today. 🌟",
        "Eliminate distractions. You are capable of deep, impactful learning! 🎯"
      ];
      const text = MOTIVATIONAL_PROMPTS[Math.floor(Math.random() * MOTIVATIONAL_PROMPTS.length)];

      try {
        await aiTutorQueue.add({
          roomId,
          type: 'motivation',
          message: text
        });
      } catch (err) {
        console.error('[AI Tutor Motivation Tick Error]:', err.message);
      }
    }
  }
}

/**
 * COMPLETION MILESTONE AI TRIGGER
 */
async function handleTimerComplete({ roomId, timer }) {
  try {
    const completionText = "☕ Spectacular job completing this focus session! You've earned your XP and focus minutes. Now take a well-deserved break!";
    
    // Delegate heavy broadcast and persistence task to the background queue
    await aiTutorQueue.add({
      roomId,
      type: 'complete',
      message: completionText
    });
  } catch (err) {
    console.error('[AI Tutor Completion Milestone Error]:', err.message);
  }
}

module.exports = {};
