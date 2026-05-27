// src/services/socraticService.js
const Flashcard = require('../models/Flashcard');
const StudySession = require('../models/StudySession');
const StudentProfile = require('../models/StudentProfile');
const aiProvider = require('./aiProvider');
const streakService = require('./streakService');
const AnalyticsService = require('./analyticsService');
const systemEventBus = require('../telemetry/eventBus');

const getRedisClient = () => {
  try {
    return require('../config/redisClient').getRedisClient();
  } catch (err) {
    return null;
  }
};

/**
 * SM-2 Spaced Repetition algorithm
 */
function calculateSM2(quality, repetitions, interval, easinessFactor) {
  let nextRepetitions = repetitions;
  let nextInterval = interval;
  let nextEasinessFactor = easinessFactor;

  if (quality >= 3) {
    if (repetitions === 0) {
      nextInterval = 1;
    } else if (repetitions === 1) {
      nextInterval = 6;
    } else {
      nextInterval = Math.ceil(interval * easinessFactor);
    }
    nextRepetitions += 1;
  } else {
    nextRepetitions = 0;
    nextInterval = 1;
  }

  // Adjust Easiness Factor
  nextEasinessFactor = easinessFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  if (nextEasinessFactor < 1.3) {
    nextEasinessFactor = 1.3;
  }

  return {
    repetitions: nextRepetitions,
    interval: nextInterval,
    easinessFactor: parseFloat(nextEasinessFactor.toFixed(4)),
    nextReviewDate: new Date(Date.now() + nextInterval * 24 * 60 * 60 * 1000)
  };
}

/**
 * Find or create a student profile
 */
async function getOrCreateStudentProfile(userId) {
  let profile = await StudentProfile.findOne({ userId });
  if (!profile) {
    profile = new StudentProfile({
      userId,
      burnoutMetrics: {
        streakCount: 0,
        consecutiveFailures: 0,
        burnoutFlag: false
      }
    });
    await profile.save();
  }
  return profile;
}

/**
 * Orchestrates the Socratic dialogue
 */
async function askSocraticQuestion({ userId, subject, userMessage }) {
  if (!userId || !subject || !userMessage) {
    throw new Error('userId, subject, and userMessage are required.');
  }

  const profile = await getOrCreateStudentProfile(userId);
  let session = await StudySession.findOne({ userId, subject, status: 'active' });
  if (!session) {
    session = new StudySession({ userId, subject, status: 'active', interactionLogs: [] });
    await session.save();
  }

  // Determine burnout patterns and confusion
  const burnoutFlag = profile.burnoutMetrics.burnoutFlag || false;
  const lastLogs = session.interactionLogs.slice(-6).map((log) => ({
    role: log.role,
    text: log.text
  }));

  const systemInstructions = `You are an elite Socratic Tutor optimized for engineering students.
Your absolute goal is to guide students to discover correct concepts on their own.

CRITICAL Socrates Methodology Rules:
1. NEVER directly give the final answer first.
2. Guide the student by giving helpful feedback, hints, or using simple analogies (Khan Academy style).
3. If they are highly confused, simplify the explanation using a highly intuitive real-world engineering analogy.
4. If they show signs of burnout (burnoutFlag: true), adopt a highly encouraging, gamified tone (Duolingo style: "You've got this! Let's take a small step back together.") and simplify the difficulty.
5. Keep your explanations structured, beautiful, and clean (Notion style, using markdown, headers, and bullet points).

You MUST respond STRICTLY in JSON format matching this shape:
{
  "tutorMessage": "Your guiding Socratic response here.",
  "confusionLevel": 3, // An integer 0 to 5 of how confused or stuck the student currently is.
  "isAnswerCorrect": false, // Boolean indicating if they correctly conceptualized/answered the last conceptual prompt.
  "topic": "The exact subtopic being discussed (e.g. 'Eigenvalues', 'Bernoulli Principle')."
}`;

  const userPrompt = `
Contextual Data:
- Subject: ${subject}
- User Active Burnout: ${burnoutFlag}
- Previous Conversation Logs: ${JSON.stringify(lastLogs)}
- User Latest Message: "${userMessage}"

Generate your Socratic guiding response now.`;

  const completionResult = await aiProvider.generateCompletion({
    prompt: userPrompt,
    systemPrompt: systemInstructions,
    userId
  });

  let responseData;
  try {
    responseData = JSON.parse(completionResult.response);
  } catch (err) {
    // Resilient fallback parser
    responseData = {
      tutorMessage: completionResult.response,
      confusionLevel: userMessage.toLowerCase().includes('confused') ? 4 : 2,
      isAnswerCorrect: false,
      topic: subject
    };
  }

  // Save interaction logs
  session.interactionLogs.push({ role: 'user', text: userMessage });
  session.interactionLogs.push({
    role: 'tutor',
    text: responseData.tutorMessage,
    confusionLevel: responseData.confusionLevel
  });

  session.performanceMetrics.totalQuestions += 1;
  if (responseData.isAnswerCorrect) {
    session.performanceMetrics.correctAnswers += 1;
  }

  const avgConfidence = (session.performanceMetrics.averageConfidence * (session.performanceMetrics.totalQuestions - 1) + (5 - responseData.confusionLevel)) / session.performanceMetrics.totalQuestions;
  session.performanceMetrics.averageConfidence = parseFloat(avgConfidence.toFixed(2));
  await session.save();

  // Update Student Profile & track burnout
  if (!responseData.isAnswerCorrect) {
    profile.burnoutMetrics.consecutiveFailures += 1;
    if (profile.burnoutMetrics.consecutiveFailures >= 3) {
      if (!profile.burnoutMetrics.burnoutFlag) {
        profile.burnoutMetrics.burnoutFlag = true;
        // Telemetry burnout detected
        AnalyticsService.track('burnout_detected', userId.toString(), {
          subject,
          topic: responseData.topic,
          consecutiveFailures: profile.burnoutMetrics.consecutiveFailures
        }).catch(() => {});
        systemEventBus.emit('burnout_detected', 'warn', { userId, subject, topic: responseData.topic }, userId);
      }
    }

    // Register weak topic
    const weakIndex = profile.weakTopics.findIndex((w) => w.topic.toLowerCase() === responseData.topic.toLowerCase());
    if (weakIndex === -1) {
      profile.weakTopics.push({
        topic: responseData.topic,
        confidence: Math.max(1, 5 - responseData.confusionLevel),
        timesFailed: 1,
        lastAttemptDate: new Date()
      });
    } else {
      profile.weakTopics[weakIndex].timesFailed += 1;
      profile.weakTopics[weakIndex].confidence = Math.max(1, Math.min(5, profile.weakTopics[weakIndex].confidence - 1));
      profile.weakTopics[weakIndex].lastAttemptDate = new Date();
    }
  } else {
    // Reset consecutive failures
    profile.burnoutMetrics.consecutiveFailures = 0;
    profile.burnoutMetrics.burnoutFlag = false;

    // Shift topic from weak topics to mastered if appropriate
    const weakIndex = profile.weakTopics.findIndex((w) => w.topic.toLowerCase() === responseData.topic.toLowerCase());
    if (weakIndex !== -1) {
      profile.weakTopics[weakIndex].confidence = Math.min(5, profile.weakTopics[weakIndex].confidence + 1);
      if (profile.weakTopics[weakIndex].confidence >= 4) {
        // Move to mastered
        if (!profile.masteredTopics.includes(responseData.topic)) {
          profile.masteredTopics.push(responseData.topic);
        }
        profile.weakTopics.splice(weakIndex, 1);
      }
    } else {
      if (!profile.masteredTopics.includes(responseData.topic)) {
        profile.masteredTopics.push(responseData.topic);
      }
    }
  }

  // Synchronize streak Count
  const user = await require('../utils/authStore').findUserById(userId);
  if (user && user.stats) {
    profile.burnoutMetrics.streakCount = user.stats.currentStreak || 0;
    profile.burnoutMetrics.lastActiveDate = user.stats.lastActiveDate || new Date();
  }

  // Update overall confidence running average
  const totalTracked = profile.weakTopics.length + profile.masteredTopics.length;
  if (totalTracked > 0) {
    const sum = profile.weakTopics.reduce((a, b) => a + b.confidence, 0) + (profile.masteredTopics.length * 5);
    profile.overallConfidenceScore = parseFloat((sum / totalTracked).toFixed(2));
  }

  await profile.save();

  return {
    tutorMessage: responseData.tutorMessage,
    confusionLevel: responseData.confusionLevel,
    isAnswerCorrect: responseData.isAnswerCorrect,
    topic: responseData.topic,
    burnoutFlag: profile.burnoutMetrics.burnoutFlag
  };
}

/**
 * Generates topic flashcards and saves them to the database
 */
async function generateFlashcards({ userId, subject, topic }) {
  if (!userId || !subject || !topic) {
    throw new Error('userId, subject, and topic are required.');
  }

  const redis = getRedisClient();
  const cacheKey = `socratic:flashcards:${subject.toLowerCase()}:${topic.toLowerCase()}`;

  if (redis && redis.status === 'ready') {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {}
  }

  const systemInstructions = `You are an academic flashcard generator. Given an engineering subject and topic, generate 5 premium flashcards.
Each flashcard must contain a clear conceptual question ('front') and a structured explanatory answer ('back').

You MUST respond strictly in JSON matching this array shape:
[
  {
    "front": "What is the physical meaning of the gradient of a scalar field?",
    "back": "The gradient vector points in the direction of the greatest rate of increase of the scalar field, and its magnitude represents that maximum rate of change."
  }
]`;

  const prompt = `Generate 5 flashcards for Subject: ${subject}, Topic: ${topic}`;

  const completionResult = await aiProvider.generateCompletion({
    prompt,
    systemPrompt: systemInstructions,
    userId
  });

  let cards = [];
  try {
    cards = JSON.parse(completionResult.response);
  } catch (err) {
    // Fallback simple parsing
    cards = [
      { front: `Review details about ${topic} in ${subject}`, back: `Key engineering focus area for ${topic}.` }
    ];
  }

  // Save to MongoDB
  const savedFlashcards = [];
  for (const card of cards) {
    const flashcard = new Flashcard({
      userId,
      front: card.front,
      back: card.back,
      subject,
      difficulty: 'medium'
    });
    await flashcard.save();
    savedFlashcards.push(flashcard);
  }

  // Cache in Redis (1 hour expiration)
  if (redis && redis.status === 'ready') {
    try {
      await redis.set(cacheKey, JSON.stringify(savedFlashcards), 'EX', 3600);
    } catch (e) {}
  }

  // Telemetry event
  AnalyticsService.track('flashcard_generated', userId.toString(), {
    subject,
    topic,
    count: savedFlashcards.length
  }).catch(() => {});
  systemEventBus.emit('flashcard_generated', 'info', { userId, subject, topic, count: savedFlashcards.length }, userId);

  return savedFlashcards;
}

/**
 * Generates multiple choice quizzes
 */
async function generateQuiz({ userId, subject, topic }) {
  if (!userId || !subject || !topic) {
    throw new Error('userId, subject, and topic are required.');
  }

  const redis = getRedisClient();
  const cacheKey = `socratic:quiz:${subject.toLowerCase()}:${topic.toLowerCase()}`;

  if (redis && redis.status === 'ready') {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (e) {}
  }

  const systemInstructions = `You are a quiz generator optimized for engineering students.
Generate a structured quiz with 3 premium multiple-choice questions.

You MUST respond strictly in JSON matching this array shape:
[
  {
    "question": "Which boundary condition represents a perfectly insulated wall in heat transfer?",
    "options": [
      "Convective boundary condition",
      "Dirichlet boundary condition",
      "Adiabatic or Neumann boundary condition (dT/dx = 0)",
      "Radiation boundary condition"
    ],
    "correctOption": 2, // 0-indexed correct option index
    "explanation": "An adiabatic boundary represents zero heat flux across the surface (insulated), mathematically written as dT/dx = 0 (Neumann condition)."
  }
]`;

  const prompt = `Generate a 3-question quiz for Subject: ${subject}, Topic: ${topic}`;

  const completionResult = await aiProvider.generateCompletion({
    prompt,
    systemPrompt: systemInstructions,
    userId
  });

  let quiz = [];
  try {
    quiz = JSON.parse(completionResult.response);
  } catch (err) {
    quiz = [
      {
        question: `Sample question about ${topic}`,
        options: ['A', 'B', 'C', 'D'],
        correctOption: 0,
        explanation: 'Correct answer explanation'
      }
    ];
  }

  // Cache in Redis (1 hour expiration)
  if (redis && redis.status === 'ready') {
    try {
      await redis.set(cacheKey, JSON.stringify(quiz), 'EX', 3600);
    } catch (e) {}
  }

  return quiz;
}

/**
 * Grade quiz results and sync strengths/weaknesses
 */
async function submitQuizResult({ userId, subject, topic, score, totalQuestions }) {
  if (!userId || !subject || !topic) {
    throw new Error('userId, subject, and topic are required.');
  }

  const profile = await getOrCreateStudentProfile(userId);
  const passed = score / totalQuestions >= 0.70;

  if (!passed) {
    profile.burnoutMetrics.consecutiveFailures += 1;
    if (profile.burnoutMetrics.consecutiveFailures >= 3) {
      profile.burnoutMetrics.burnoutFlag = true;
      AnalyticsService.track('burnout_detected', userId.toString(), {
        subject,
        topic,
        consecutiveFailures: profile.burnoutMetrics.consecutiveFailures
      }).catch(() => {});
      systemEventBus.emit('burnout_detected', 'warn', { userId, subject, topic }, userId);
    }

    const weakIndex = profile.weakTopics.findIndex((w) => w.topic.toLowerCase() === topic.toLowerCase());
    if (weakIndex === -1) {
      profile.weakTopics.push({
        topic,
        confidence: 2,
        timesFailed: 1,
        lastAttemptDate: new Date()
      });
    } else {
      profile.weakTopics[weakIndex].timesFailed += 1;
      profile.weakTopics[weakIndex].confidence = Math.max(1, profile.weakTopics[weakIndex].confidence - 1);
      profile.weakTopics[weakIndex].lastAttemptDate = new Date();
    }
  } else {
    profile.burnoutMetrics.consecutiveFailures = 0;
    profile.burnoutMetrics.burnoutFlag = false;

    const weakIndex = profile.weakTopics.findIndex((w) => w.topic.toLowerCase() === topic.toLowerCase());
    if (weakIndex !== -1) {
      profile.weakTopics.splice(weakIndex, 1);
    }
    if (!profile.masteredTopics.includes(topic)) {
      profile.masteredTopics.push(topic);
    }
  }

  await profile.save();

  // Telemetry event
  AnalyticsService.track('quiz_completed', userId.toString(), {
    subject,
    topic,
    score,
    totalQuestions,
    passed
  }).catch(() => {});
  systemEventBus.emit('quiz_completed', 'info', { userId, subject, topic, score, totalQuestions, passed }, userId);

  return {
    passed,
    consecutiveFailures: profile.burnoutMetrics.consecutiveFailures,
    burnoutFlag: profile.burnoutMetrics.burnoutFlag
  };
}

/**
 * Reviews a flashcard using the SM-2 algorithm, triggers daily streaks
 */
async function spacedRepetitionReview({ userId, flashcardId, quality }) {
  if (!userId || !flashcardId || quality === undefined) {
    throw new Error('userId, flashcardId, and quality (0-5) are required.');
  }

  const card = await Flashcard.findOne({ _id: flashcardId, userId });
  if (!card) {
    throw new Error('Flashcard not found.');
  }

  // Calculate new SM-2 spaced repetition values
  const sm2Result = calculateSM2(
    quality,
    card.sm2.repetitions,
    card.sm2.interval,
    card.sm2.easinessFactor
  );

  card.sm2.repetitions = sm2Result.repetitions;
  card.sm2.interval = sm2Result.interval;
  card.sm2.easinessFactor = sm2Result.easinessFactor;
  card.sm2.nextReviewDate = sm2Result.nextReviewDate;
  card.sm2.lastReviewedDate = new Date();
  await card.save();

  // Synchronize overall confidence score in profile
  const profile = await getOrCreateStudentProfile(userId);
  const weakIndex = profile.weakTopics.findIndex((w) => w.topic.toLowerCase() === card.subject.toLowerCase());
  
  if (quality < 3) {
    if (weakIndex === -1) {
      profile.weakTopics.push({
        topic: card.subject,
        confidence: Math.max(1, quality),
        timesFailed: 1,
        lastAttemptDate: new Date()
      });
    } else {
      profile.weakTopics[weakIndex].timesFailed += 1;
      profile.weakTopics[weakIndex].confidence = Math.max(1, Math.min(5, quality));
    }
  } else {
    if (weakIndex !== -1) {
      profile.weakTopics[weakIndex].confidence = Math.min(5, profile.weakTopics[weakIndex].confidence + 1);
      if (profile.weakTopics[weakIndex].confidence >= 4) {
        profile.weakTopics.splice(weakIndex, 1);
        if (!profile.masteredTopics.includes(card.subject)) {
          profile.masteredTopics.push(card.subject);
        }
      }
    }
  }

  // Evaluate Daily Study Streak activity
  let streakCount = profile.burnoutMetrics.streakCount || 0;
  const streakStats = await streakService.recordStreakActivity(userId);
  if (streakStats) {
    streakCount = streakStats.currentStreak;
    profile.burnoutMetrics.streakCount = streakCount;
    profile.burnoutMetrics.lastActiveDate = new Date();
  }
  await profile.save();

  // Telemetry streak_saved
  AnalyticsService.track('streak_saved', userId.toString(), {
    streakCount,
    subject: card.subject
  }).catch(() => {});
  systemEventBus.emit('streak_saved', 'info', { userId, streakCount, subject: card.subject }, userId);

  return {
    card,
    streakCount,
    nextReviewDate: card.sm2.nextReviewDate
  };
}

/**
 * Summarizes weaknesses and generates a custom Socratic remediation path
 */
async function generateWeaknessSummary(userId) {
  if (!userId) {
    throw new Error('userId is required.');
  }

  const profile = await getOrCreateStudentProfile(userId);
  if (profile.weakTopics.length === 0) {
    return {
      summary: `### Duolingo Motivation Mode! 🎉\n\n**Amazing work!** You have no weak topics on your list. Every concept is fully mastered or perfectly moving along. Keep up the extreme academic focus! ⚡`
    };
  }

  const topicsList = profile.weakTopics.map((w) => `- **${w.topic}** (Confidence Score: ${w.confidence}/5, Attempts Failed: ${w.timesFailed})`).join('\n');

  const systemInstructions = `You are an elite academic Socratic Remediation expert.
Generate a structured, beautiful, and customized conceptual study plan (Notion style, using markdown, bold titles, clean headers, and emojis) based on the student's weaknesses.

For each weak topic:
1. Explain the core concept simply using a highly intuitive analogy (Khan Academy style).
2. Give them a customized Socratic conceptual question they can ask themselves to test their understanding.
3. Add a motivating encouraging quote (Duolingo style) to fire up their study streak!`;

  const prompt = `Student Weakness Log:\n${topicsList}\n\nGenerate their customized Notion-style remediation summary plan now.`;

  const completionResult = await aiProvider.generateCompletion({
    prompt,
    systemPrompt: systemInstructions,
    userId
  });

  return {
    summary: completionResult.response
  };
}

module.exports = {
  askSocraticQuestion,
  generateFlashcards,
  generateQuiz,
  submitQuizResult,
  spacedRepetitionReview,
  generateWeaknessSummary,
  calculateSM2
};
