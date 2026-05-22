// src/routes/messages.js
// Message routes: send a message, fetch conversation history

const express = require('express');
const Message = require('../models/Message');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { getIO } = require('../socket');

const router = express.Router();

// All message routes require authentication
router.use(protect);

// ─── POST /api/messages/send ──────────────────────────────────────────────────
// Send a message to another user
router.post('/send', async (req, res) => {
  try {
    const { receiverId, content } = req.body;

    if (!receiverId || !content) {
      return res.status(400).json({ message: 'Receiver ID and content are required' });
    }

    if (receiverId === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot message yourself' });
    }

    // Verify the receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ message: 'Receiver not found' });
    }

    // Save the message to the database
    const message = await Message.create({
      sender: req.user._id,
      receiver: receiverId,
      content: content.trim(),
    });

    // Populate sender info for the response
    const populatedMessage = await message.populate('sender', 'username avatar');

    // Emit the message in real-time via Socket.io
    // The receiver's room is their userId — clients join their own room on connect
    const io = getIO();
    io.to(receiverId).emit('receive_message', populatedMessage);

    res.status(201).json({ message: populatedMessage });
  } catch (error) {
    console.error('Send message error:', error);
    res.status(500).json({ message: 'Failed to send message' });
  }
});

// ─── GET /api/messages/:userId ────────────────────────────────────────────────
// Fetch all messages between the current user and another user
router.get('/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user._id;

    // Get messages in both directions between the two users
    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId },
      ],
    })
      .populate('sender', 'username avatar')
      .populate('receiver', 'username avatar')
      .sort({ createdAt: 1 }); // oldest first

    // Mark messages from the other user as read
    await Message.updateMany(
      { sender: userId, receiver: currentUserId, isRead: false },
      { isRead: true }
    );

    res.json({ messages });
  } catch (error) {
    console.error('Fetch messages error:', error);
    res.status(500).json({ message: 'Failed to fetch messages' });
  }
});

module.exports = router;
