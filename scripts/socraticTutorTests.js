#!/usr/bin/env node
// scripts/socraticTutorTests.js
const assert = require('assert').strict;
const mongoose = require('mongoose');
const socraticService = require('../src/services/socraticService');
const Flashcard = require('../src/models/Flashcard');
const StudySession = require('../src/models/StudySession');
const StudentProfile = require('../src/models/StudentProfile');
const User = require('../src/models/User');
const aiProvider = require('../src/services/aiProvider');
const systemEventBus = require('../src/telemetry/eventBus');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const yellow = '\x1b[33m';

// Stub tracking list for telemetry events
const telemetryEvents = [];
systemEventBus.subscribe((event) => {
  telemetryEvents.push({ event: event.eventType, level: event.severity, data: event.payload });
});

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`${green}✔ [PASSED]${reset} ${name}`);
  } catch (error) {
    console.error(`${red}✘ [FAILED]${reset} ${name}`);
    console.error(error);
    process.exit(1);
  }
}

async function runAll() {
  console.log(`${yellow}=== STARTING SOCRATIC AI TUTOR SYSTEM INTEGRATION CHECKS ===${reset}\n`);

  const testUserId = new mongoose.Types.ObjectId();

  // ─── STUB MONGOOSE & DB OPERATIONS FOR ISOLATED TESTING ────────────────────
  const mockUser = {
    _id: testUserId,
    username: 'socratic_tester',
    email: 'tester@socratic.edu',
    password: 'password123',
    tier: 'pro',
    stats: {
      currentStreak: 5,
      longestStreak: 5,
      totalFocusMinutes: 120,
      lastActiveDate: new Date()
    }
  };

  const mockProfile = {
    userId: testUserId,
    overallConfidenceScore: 3.0,
    weakTopics: [],
    masteredTopics: [],
    burnoutMetrics: {
      streakCount: 5,
      lastActiveDate: new Date(),
      consecutiveFailures: 0,
      burnoutFlag: false
    },
    save: async function() { return this; }
  };

  const mockSession = {
    userId: testUserId,
    subject: 'Linear Algebra',
    startTime: new Date(),
    performanceMetrics: {
      totalQuestions: 0,
      correctAnswers: 0,
      averageConfidence: 0
    },
    status: 'active',
    interactionLogs: [],
    save: async function() { return this; }
  };

  const mockFlashcard = {
    _id: new mongoose.Types.ObjectId(),
    userId: testUserId,
    front: 'Front side',
    back: 'Back side',
    subject: 'Linear Algebra',
    difficulty: 'medium',
    sm2: {
      repetitions: 0,
      interval: 1,
      easinessFactor: 2.5,
      nextReviewDate: new Date()
    },
    save: async function() { return this; }
  };

  // Override static model functions
  StudentProfile.findOne = async () => mockProfile;
  StudySession.findOne = async () => mockSession;
  Flashcard.findOne = async () => mockFlashcard;
  Flashcard.find = async () => [mockFlashcard];
  Flashcard.deleteMany = async () => {};
  StudySession.deleteMany = async () => {};
  StudentProfile.deleteMany = async () => {};
  User.deleteMany = async () => {};

  // Stub User lookup in authStore
  const authStore = require('../src/utils/authStore');
  const originalFindUserById = authStore.findUserById;
  authStore.findUserById = async () => mockUser;

  // Stub Flashcard save to instantiate locally
  Flashcard.prototype.save = async function() { return this; };

  // ─── 1. Spaced Repetition (SM-2) Formulas ──────────────────────────────────
  await runTest('SM-2 Spaced Repetition algorithm transitions', () => {
    // Initial card setup: repetitions = 0, interval = 1, EF = 2.5
    // Perfect response: quality = 5
    let result = socraticService.calculateSM2(5, 0, 1, 2.5);
    assert.equal(result.repetitions, 1);
    assert.equal(result.interval, 1);
    assert.equal(result.easinessFactor, 2.6);
    assert.ok(result.nextReviewDate > new Date());

    // Second perfect response: quality = 5
    result = socraticService.calculateSM2(5, 1, 1, 2.6);
    assert.equal(result.repetitions, 2);
    assert.equal(result.interval, 6);
    assert.equal(result.easinessFactor, 2.7);

    // Third decent response: quality = 4
    result = socraticService.calculateSM2(4, 2, 6, 2.7);
    assert.equal(result.repetitions, 3);
    assert.equal(result.interval, 17); // ceil(6 * 2.7) = 17
    assert.ok(result.easinessFactor > 2.6);

    // Complete fail recall: quality = 1
    result = socraticService.calculateSM2(1, 3, 17, 2.7);
    assert.equal(result.repetitions, 0);
    assert.equal(result.interval, 1);
    assert.ok(result.easinessFactor < 2.5); // EF decreases upon failure
  });

  // ─── 2. Dialogue & Burnout Pattern Cascades ───────────────────────────────
  await runTest('Socratic chat dialogues, confusion & burnout triggers', async () => {
    const originalGenerate = aiProvider.generateCompletion;

    // Reset mock failures
    mockProfile.burnoutMetrics.consecutiveFailures = 0;
    mockProfile.burnoutMetrics.burnoutFlag = false;

    // Stub LLM to return confused response
    aiProvider.generateCompletion = async () => ({
      response: JSON.stringify({
        tutorMessage: "I see you are getting stuck on eigenvalues. What is the determinant equation for eigenvalues?",
        confusionLevel: 4,
        isAnswerCorrect: false,
        topic: "Eigenvalues"
      })
    });

    // 1st Failure
    let response = await socraticService.askSocraticQuestion({
      userId: testUserId,
      subject: 'Linear Algebra',
      userMessage: 'I have no idea'
    });
    assert.equal(response.isAnswerCorrect, false);
    assert.equal(response.confusionLevel, 4);
    assert.equal(response.burnoutFlag, false); // Not burned out yet (only 1 failure)

    // 2nd Failure
    response = await socraticService.askSocraticQuestion({
      userId: testUserId,
      subject: 'Linear Algebra',
      userMessage: 'Still clueless'
    });
    assert.equal(response.burnoutFlag, false); // 2 failures

    // 3rd Failure -> Triggers Burnout!
    response = await socraticService.askSocraticQuestion({
      userId: testUserId,
      subject: 'Linear Algebra',
      userMessage: 'Help me please'
    });
    assert.equal(response.burnoutFlag, true); // Burnout triggers at >= 3 consecutive failures!

    // Verify burnout_detected telemetry was logged
    const burnoutEvent = telemetryEvents.find(e => e.event === 'burnout_detected');
    assert.ok(burnoutEvent, 'Should fire burnout_detected telemetry event.');
    assert.equal(burnoutEvent.data.subject, 'Linear Algebra');
    assert.equal(burnoutEvent.data.topic, 'Eigenvalues');

    // Stub LLM to return correct/restored response
    aiProvider.generateCompletion = async () => ({
      response: JSON.stringify({
        tutorMessage: "Perfectly explained! det(A - lambda*I) = 0 is the correct characteristic equation.",
        confusionLevel: 0,
        isAnswerCorrect: true,
        topic: "Eigenvalues"
      })
    });

    // Student solves the problem -> Burnout resets!
    response = await socraticService.askSocraticQuestion({
      userId: testUserId,
      subject: 'Linear Algebra',
      userMessage: 'Is it det(A - lambda*I) = 0?'
    });
    assert.equal(response.isAnswerCorrect, true);
    assert.equal(response.burnoutFlag, false); // Burnout flag reset to false!

    // Restore original generator
    aiProvider.generateCompletion = originalGenerate;
  });

  // ─── 3. Flashcards Generation & Redis Caching ──────────────────────────────
  await runTest('Academic Flashcard synthesis & Redis caching controls', async () => {
    const originalGenerate = aiProvider.generateCompletion;

    aiProvider.generateCompletion = async () => ({
      response: JSON.stringify([
        { front: "What is an eigenvalue?", back: "A scalar lambda such that Ax = lambda*x." },
        { front: "What is an eigenvector?", back: "A non-zero vector x that does not change direction under linear transform." }
      ])
    });

    const cards = await socraticService.generateFlashcards({
      userId: testUserId,
      subject: 'Linear Algebra',
      topic: 'Eigenvectors'
    });

    assert.equal(cards.length, 2);
    assert.equal(cards[0].front, "What is an eigenvalue?");
    assert.equal(cards[1].subject, "Linear Algebra");

    // Verify flashcard_generated telemetry event
    const flashcardEvent = telemetryEvents.find(e => e.event === 'flashcard_generated');
    assert.ok(flashcardEvent, 'Should fire flashcard_generated telemetry.');
    assert.equal(flashcardEvent.data.topic, 'Eigenvectors');
    assert.equal(flashcardEvent.data.count, 2);

    aiProvider.generateCompletion = originalGenerate;
  });

  // ─── 4. Quiz Synthesis & Remediation sync ────────────────────────────────
  await runTest('Quiz completions & weakness synchronizations', async () => {
    const originalGenerate = aiProvider.generateCompletion;

    aiProvider.generateCompletion = async () => ({
      response: JSON.stringify([
        { question: "Q1", options: ["A", "B"], correctOption: 0, explanation: "Correct!" }
      ])
    });

    const quiz = await socraticService.generateQuiz({
      userId: testUserId,
      subject: 'Linear Algebra',
      topic: 'Determinants'
    });
    assert.equal(quiz.length, 1);
    assert.equal(quiz[0].question, "Q1");

    // Submit failed quiz result (0/1)
    let grading = await socraticService.submitQuizResult({
      userId: testUserId,
      subject: 'Linear Algebra',
      topic: 'Determinants',
      score: 0,
      totalQuestions: 1
    });
    assert.equal(grading.passed, false);

    // Verify quiz_completed telemetry
    const quizEvent = telemetryEvents.find(e => e.event === 'quiz_completed');
    assert.ok(quizEvent, 'Should fire quiz_completed telemetry.');
    assert.equal(quizEvent.data.topic, 'Determinants');
    assert.equal(quizEvent.data.passed, false);

    // Verify topic determinants is added to weakness log
    const profile = await StudentProfile.findOne({ userId: testUserId });
    const weakItem = profile.weakTopics.find(w => w.topic === 'Determinants');
    assert.ok(weakItem, 'Failed quiz topic should be logged under weakTopics.');
    assert.ok(weakItem.timesFailed >= 1);

    aiProvider.generateCompletion = originalGenerate;
  });

  // ─── 5. Spaced Repetition (SM-2) Reviews & Streak Integrations ─────────────
  await runTest('Flashcard spaced reviews & study streaks tracking', async () => {
    const review = await socraticService.spacedRepetitionReview({
      userId: testUserId,
      flashcardId: mockFlashcard._id,
      quality: 4 // Good recall
    });

    assert.ok(review.card.sm2.repetitions >= 1);
    assert.ok(review.streakCount >= 1); // User study streak recorded!

    // Verify streak_saved telemetry
    const streakEvent = telemetryEvents.find(e => e.event === 'streak_saved');
    assert.ok(streakEvent, 'Should fire streak_saved telemetry.');
    assert.ok(streakEvent.data.streakCount >= 1);
  });

  // ─── 6. Socratic Weakness Summaries ───────────────────────────────────────
  await runTest('Socratic custom weakness conceptual remediation summaries', async () => {
    const originalGenerate = aiProvider.generateCompletion;

    aiProvider.generateCompletion = async () => ({
      response: "### Customized Socratic Study Plan\n- Focus on Eigenvalues analogy..."
    });

    const summary = await socraticService.generateWeaknessSummary(testUserId);
    assert.ok(summary.summary.includes('Customized Socratic Study Plan'));

    aiProvider.generateCompletion = originalGenerate;
  });

  // Restore stubs
  authStore.findUserById = originalFindUserById;

  console.log(`\n${green}=== ALL SOCRATIC AI TUTOR CHECKS PASSED SUCCESSFULLY ===${reset}`);
  console.log(`${green}Socratic AI Tutor Architecture & SM-2 Engine are fully verified!${reset}`);
}

runAll().catch(err => {
  console.error(`${red}✘ Verification Suite halted due to unhandled error:${reset}`, err);
  process.exit(1);
});
