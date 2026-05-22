const express = require('express');
const router = express.Router();
const FocusSession = require('../models/FocusSession');
const User = require('../models/User');
const { aiQueue } = require('../queue/aiQueue');

// Log a new focus session completion
router.post('/log', async (req, res, next) => {
  try {
    // userId from auth middleware
    const { userId, roomId, durationMinutes, completedIntendedDuration } = req.body;

    const session = await FocusSession.create({
      userId,
      roomId,
      durationMinutes,
      completedIntendedDuration,
      endTime: new Date()
    });

    // Update user stats
    await User.findByIdAndUpdate(userId, {
      $inc: { 'stats.totalFocusMinutes': durationMinutes },
      $set: { 'stats.lastActiveDate': new Date() }
    });

    // Dispatch async job for the AI Coach to analyze this session
    await aiQueue.add('generate_summary', { 
      userId, 
      sessionId: session._id 
    });

    res.status(201).json({ status: 'success', data: session });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
