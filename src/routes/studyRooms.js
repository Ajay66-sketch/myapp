// src/routes/studyRooms.js
// Routes for study rooms utilizing RoomRepository for cache-first persistence

const express = require('express');
const router = express.Router();
const roomRepository = require('../repositories/RoomRepository');

// Get all public study rooms
router.get('/', async (req, res, next) => {
  try {
    const rooms = await roomRepository.getAll(false);
    res.status(200).json({ status: 'success', data: rooms });
  } catch (error) {
    next(error);
  }
});

// Create a new study room
router.post('/', async (req, res, next) => {
  try {
    const { name, description, creatorId, isPrivate, tags, settings } = req.body;
    
    // Fallback ownerId mapping
    const room = await roomRepository.create({
      name,
      description,
      ownerId: creatorId,
      isPrivate,
      tags,
      settings
    });

    res.status(201).json({ status: 'success', data: room });
  } catch (error) {
    next(error);
  }
});

// Get single study room
router.get('/:id', async (req, res, next) => {
  try {
    const room = await roomRepository.get(req.params.id);
    if (!room) {
      return res.status(404).json({ status: 'error', message: 'Room not found' });
    }
    res.status(200).json({ status: 'success', data: room });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
