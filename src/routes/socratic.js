// src/routes/socratic.js
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const socraticService = require('../services/socraticService');
const Flashcard = require('../models/Flashcard');

/**
 * POST /api/v1/socratic/chat
 * Socratic interactive tutor dialogue endpoint
 */
router.post('/chat', protect, async (req, res, next) => {
  try {
    const { subject, message } = req.body;
    if (!subject || !message) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'subject and message are required' });
    }

    const result = await socraticService.askSocraticQuestion({
      userId: req.user._id,
      subject,
      userMessage: message
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/socratic/flashcards
 * Generate topic flashcards with Redis caching and bulk Mongo insertions
 */
router.post('/flashcards', protect, async (req, res, next) => {
  try {
    const { subject, topic } = req.body;
    if (!subject || !topic) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'subject and topic are required' });
    }

    const result = await socraticService.generateFlashcards({
      userId: req.user._id,
      subject,
      topic
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/socratic/flashcards/due
 * Retrieve due flashcards for spaced repetition review
 */
router.get('/flashcards/due', protect, async (req, res, next) => {
  try {
    const { subject } = req.query;
    const query = {
      userId: req.user._id,
      'sm2.nextReviewDate': { $lte: new Date() }
    };
    if (subject) {
      query.subject = subject;
    }

    const dueCards = await Flashcard.find(query).sort({ 'sm2.nextReviewDate': 1 });
    res.json(dueCards);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/socratic/flashcards/review
 * Submit quality (0-5) for SM-2 spaced repetition review
 */
router.post('/flashcards/review', protect, async (req, res, next) => {
  try {
    const { flashcardId, quality } = req.body;
    if (!flashcardId || quality === undefined) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'flashcardId and quality are required' });
    }

    const q = parseInt(quality, 10);
    if (isNaN(q) || q < 0 || q > 5) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Quality must be an integer between 0 and 5' });
    }

    const result = await socraticService.spacedRepetitionReview({
      userId: req.user._id,
      flashcardId,
      quality: q
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/socratic/quiz
 * Generate structured quiz with Redis caching
 */
router.post('/quiz', protect, async (req, res, next) => {
  try {
    const { subject, topic } = req.body;
    if (!subject || !topic) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'subject and topic are required' });
    }

    const result = await socraticService.generateQuiz({
      userId: req.user._id,
      subject,
      topic
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/socratic/quiz/submit
 * Grade quizzes and sync student weaknesses
 */
router.post('/quiz/submit', protect, async (req, res, next) => {
  try {
    const { subject, topic, score, totalQuestions } = req.body;
    if (!subject || !topic || score === undefined || !totalQuestions) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'subject, topic, score, and totalQuestions are required' });
    }

    const result = await socraticService.submitQuizResult({
      userId: req.user._id,
      subject,
      topic,
      score: Number(score),
      totalQuestions: Number(totalQuestions)
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/socratic/weakness-summary
 * Get Notion-style conceptual study guide based on weak topics list
 */
router.get('/weakness-summary', protect, async (req, res, next) => {
  try {
    const result = await socraticService.generateWeaknessSummary(req.user._id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
