// src/routes/rooms.js
// Express API router for study and chat rooms management

const express = require('express');
const { protect } = require('../middleware/auth');
const roomStore = require('../utils/roomStore');
const permissions = require('../utils/permissions');
const { logAuditEvent } = require('../utils/auditLogger');

const router = express.Router();

// All room routes require authentication
router.use(protect);

/**
 * GET /api/v1/rooms
 * List all non-private rooms
 */
router.get('/', async (req, res) => {
  try {
    const rooms = await roomStore.findRooms();
    return res.json({
      success: true,
      rooms,
    });
  } catch (error) {
    console.error('[Rooms API] Fetch rooms error:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to fetch rooms' });
  }
});

/**
 * POST /api/v1/rooms
 * Create a new room (Enforces plan-based monetization limits)
 */
router.post('/', async (req, res) => {
  try {
    const { name, slug, tierRequired = 'free', isPrivate = false } = req.body;

    // ─── 1. Validation ───────────────────────────────────────────────────────
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Room name is required' });
    }

    if (!slug || !slug.trim()) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Room slug is required' });
    }

    const normSlug = String(slug).trim().toLowerCase();
    const slugRegex = /^[a-z0-9-_]+$/;
    if (!slugRegex.test(normSlug)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Room slug can only contain lowercase letters, numbers, dashes, and underscores',
      });
    }

    // ─── 2. Monetization Plan-Based Limit Check ──────────────────────────────
    const currentRoomCount = await roomStore.countRoomsByOwnerId(req.user._id);
    if (!permissions.canCreateRoom(req.user, currentRoomCount)) {
      logAuditEvent({
        action: 'feature_access_denied',
        userId: req.user._id,
        previousTier: req.user.tier || 'free',
        resource: req.originalUrl,
        success: false,
        metadata: { reason: 'Room limit reached' },
      });

      return res.status(403).json({
        error: 'ROOM_LIMIT_EXCEEDED',
        message: 'Free tier accounts are limited to creating a maximum of 1 room. Upgrade to Pro for unlimited rooms.',
      });
    }

    // ─── 3. Slug Uniqueness Check ────────────────────────────────────────────
    const existingRoom = await roomStore.findRoomBySlug(normSlug);
    if (existingRoom) {
      return res.status(400).json({
        error: 'DUPLICATE_SLUG',
        message: `The slug '${normSlug}' is already taken. Please choose another URL slug.`,
      });
    }

    // ─── 4. Create Room ──────────────────────────────────────────────────────
    const room = await roomStore.createRoom({
      name: name.trim(),
      slug: normSlug,
      ownerId: req.user._id,
      tierRequired: String(tierRequired).toLowerCase(),
      isPrivate: !!isPrivate,
    });

    // ─── 5. Audit Logging ────────────────────────────────────────────────────
    logAuditEvent({
      action: 'room_created',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: {
        roomId: room._id,
        name: room.name,
        slug: room.slug,
        tierRequired: room.tierRequired,
      },
    });

    // ─── 5.5 Unlock Achievement ──────────────────────────────────────────────
    const achievementService = require('../services/achievementService');
    await achievementService.checkAndUnlock(req.user._id, 'FIRST_ROOM');

    return res.status(201).json({
      success: true,
      room,
    });
  } catch (error) {
    console.error('[Rooms API] Create room error:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to create room' });
  }
});

/**
 * GET /api/v1/rooms/:roomId/messages
 * Load historical messages for a room (Enforces premium room checks)
 */
router.get('/:roomId/messages', async (req, res) => {
  try {
    const { roomId } = req.params;

    // ─── 1. Find Room ────────────────────────────────────────────────────────
    const room = await roomStore.findRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'ROOM_NOT_FOUND', message: 'The requested room does not exist' });
    }

    // ─── 2. Enforce Pro Tier for Premium Rooms ────────────────────────────────
    if (room.tierRequired === 'pro') {
      const plan = permissions.getPlan(req.user);
      if (plan.id === 'free') {
        logAuditEvent({
          action: 'feature_access_denied',
          userId: req.user._id,
          previousTier: req.user.tier || 'free',
          resource: req.originalUrl,
          success: false,
          metadata: { reason: 'Premium room access blocked' },
        });

        return res.status(403).json({
          error: 'PRO_REQUIRED',
          message: 'A Pro subscription is required to access this premium room',
        });
      }
    }

    // ─── 3. Fetch Message History ────────────────────────────────────────────
    const messages = await roomStore.findMessagesByRoomId(roomId, 50);

    return res.json({
      success: true,
      messages,
    });
  } catch (error) {
    console.error('[Rooms API] Fetch messages history error:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to load messages history' });
  }
});

/**
 * POST /api/v1/rooms/:roomId/join
 * Join a room and register membership (Enforces premium checks)
 */
router.post('/:roomId/join', async (req, res) => {
  try {
    const { roomId } = req.params;

    // ─── 1. Find Room ────────────────────────────────────────────────────────
    const room = await roomStore.findRoomById(roomId);
    if (!room) {
      return res.status(404).json({ error: 'ROOM_NOT_FOUND', message: 'The requested room does not exist' });
    }

    // ─── 2. Enforce Pro Tier for Premium Rooms ────────────────────────────────
    if (room.tierRequired === 'pro') {
      const plan = permissions.getPlan(req.user);
      if (plan.id === 'free') {
        logAuditEvent({
          action: 'feature_access_denied',
          userId: req.user._id,
          previousTier: req.user.tier || 'free',
          resource: req.originalUrl,
          success: false,
          metadata: { reason: 'Premium room join blocked' },
        });

        return res.status(403).json({
          error: 'PRO_REQUIRED',
          message: 'A Pro subscription is required to join this premium room',
        });
      }
    }

    // ─── 3. Add Member ───────────────────────────────────────────────────────
    const updatedRoom = await roomStore.addMemberToRoom(room._id, req.user._id);

    // ─── 4. Audit Logging ────────────────────────────────────────────────────
    logAuditEvent({
      action: 'room_joined',
      userId: req.user._id,
      previousTier: req.user.tier || 'free',
      resource: req.originalUrl,
      success: true,
      metadata: {
        roomId: room._id,
        slug: room.slug,
      },
    });

    return res.json({
      success: true,
      room: updatedRoom,
    });
  } catch (error) {
    console.error('[Rooms API] Join room error:', error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Failed to join room' });
  }
});

module.exports = router;
