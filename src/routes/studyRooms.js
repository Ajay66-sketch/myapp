// src/routes/studyRooms.js
const express = require('express');
const router = express.Router();
const StudyRoom = require('../models/StudyRoom');

// Get all public study rooms
router.get('/', async (req, res, next) => {
  try {
    const rooms = await StudyRoom.find({ isPrivate: false }).sort({ activeUsersCount: -1 });
    res.status(200).json({ status: 'success', data: rooms });
  } catch (error) {
    next(error);
  }
});

// Create a new study room
router.post('/', async (req, res, next) => {
  try {
    // In a real app, creatorId comes from req.user (auth middleware)
    const { name, description, creatorId, isPrivate, tags, settings } = req.body;
    
    const newRoom = await StudyRoom.create({
      name,
      description,
      creatorId,
      isPrivate,
      tags,
      settings
    });

    res.status(201).json({ status: 'success', data: newRoom });
  } catch (error) {
    next(error);
  }
});

// Get single study room
router.get('/:id', async (req, res, next) => {
  try {
    const room = await StudyRoom.findById(req.params.id);
    if (!room) {
      return res.status(404).json({ status: 'error', message: 'Room not found' });
    }
    res.status(200).json({ status: 'success', data: room });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
