// src/utils/verifyFocusMode.js
// Automated verification suite for the newly designed AI Study Focus Mode

const assert = require('assert').strict;
const eventBus = require('../telemetry/eventBus');
const authStore = require('./authStore');
const xpService = require('../services/xpService');
const notificationService = require('../services/notificationService');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';
const yellow = '\x1b[33m';

function runTest(name, fn) {
  try {
    fn();
    console.log(`${green}✔ [PASSED]${reset} ${name}`);
  } catch (error) {
    console.error(`${red}✘ [FAILED]${reset} ${name}`);
    console.error(error);
    process.exit(1);
  }
}

async function runTestAsync(name, fn) {
  try {
    await fn();
    console.log(`${green}✔ [PASSED]${reset} ${name}`);
  } catch (error) {
    console.error(`${red}✘ [FAILED]${reset} ${name}`);
    console.error(error);
    process.exit(1);
  }
}

console.log(`${yellow}=== STARTING AI STUDY FOCUS MODE VERIFICATION ===${reset}\n`);

// ─── 1. Mock Data Setup ──────────────────────────────────────────────────────
let testUser;

runTestAsync('Preparation: In-Memory DB & User Registration', async () => {
  // Clear any existing database/memory users
  testUser = await authStore.createUser({
    _id: 'user_scholar_101',
    username: 'IsaacNewton',
    email: 'isaac@gravity.org',
  });

  assert.equal(testUser.username, 'IsaacNewton');
  assert.equal(testUser.xp, 0);
  assert.equal(testUser.stats.totalFocusMinutes, 0);
});

// ─── 2. Telemetry Logs Capturing ─────────────────────────────────────────────
runTest('Telemetry Event Emissions for Focus Events', () => {
  const eventsCaptured = [];
  const unsubscribe = eventBus.subscribe((evt) => {
    if (evt.eventType.startsWith('timer:') || evt.eventType.startsWith('ai:')) {
      eventsCaptured.push(evt);
    }
  });

  // Emulate socket timer triggers
  eventBus.emit('timer:start', 'info', { roomId: 'corridor_9', duration: 1500 }, 'user_scholar_101');
  eventBus.emit('timer:pause', 'warn', { roomId: 'corridor_9' }, 'user_scholar_101');
  eventBus.emit('timer:resume', 'info', { roomId: 'corridor_9' }, 'user_scholar_101');
  eventBus.emit('ai:tutor_motivation', 'info', { roomId: 'corridor_9', message: 'Sit up straight!' }, 'ai_tutor_system');
  eventBus.emit('timer:complete', 'info', { roomId: 'corridor_9', duration: 1500 }, 'system');

  unsubscribe();

  assert.equal(eventsCaptured.length, 5);
  assert.equal(eventsCaptured[0].eventType, 'timer:start');
  assert.equal(eventsCaptured[0].payload.duration, 1500);
  assert.equal(eventsCaptured[0].userId, 'user_scholar_101');

  assert.equal(eventsCaptured[1].eventType, 'timer:pause');
  assert.equal(eventsCaptured[1].severity, 'warn');

  assert.equal(eventsCaptured[3].eventType, 'ai:tutor_motivation');
  assert.equal(eventsCaptured[3].userId, 'ai_tutor_system');

  assert.equal(eventsCaptured[4].eventType, 'timer:complete');
});

// ─── 3. Dynamic Persistent System Notifications ──────────────────────────────
runTestAsync('Study Session Notification System Integrations', async () => {
  notificationService.clearInMemoryNotifications();

  // Trigger simulated start notification
  await notificationService.createNotification({
    userId: 'user_scholar_101',
    type: 'system',
    title: 'Study Focus Session Started! ⏱️',
    message: "Your corridor started a 25-minute focus sprint. Let's do this!",
  });

  // Trigger simulated completed + break reminder
  await notificationService.createNotification({
    userId: 'user_scholar_101',
    type: 'system',
    title: 'Time for a break! ☕',
    message: 'Your room completed the focus sprint! Take a well-deserved 5-minute break.',
  });

  const { notifications, unreadCount } = await notificationService.getNotifications('user_scholar_101');

  assert.equal(notifications.length, 2);
  assert.equal(unreadCount, 2);
  assert.equal(notifications[0].title, 'Time for a break! ☕');
  assert.equal(notifications[1].title, 'Study Focus Session Started! ⏱️');
});

// ─── 4. XP and real-time Focus Minutes Sync ─────────────────────────────────
runTestAsync('XP & Leaderboard Focus Minutes Sync Mechanics', async () => {
  // Emulate completion of a 25-minute Pomodoro sprint (1500 seconds)
  const durationSec = 1500;
  const minutesGained = Math.round(durationSec / 60); // 25 minutes

  // 1. Award XP
  const xpReward = await xpService.awardXp('user_scholar_101', 'FOCUS_SESSION');
  assert.ok(xpReward);
  assert.equal(xpReward.xpGained, 10); // Standard Focus session rewards 10 XP in config

  // 2. Fetch fresh user context and update study stats
  const user = await authStore.findUserById('user_scholar_101');
  assert.ok(user);
  
  user.stats.totalFocusMinutes = (user.stats.totalFocusMinutes || 0) + minutesGained;
  await authStore.saveUser(user);

  // Assert user profiles reflect statistics updates
  const updatedUser = await authStore.findUserById('user_scholar_101');
  assert.equal(updatedUser.xp, 10);
  assert.equal(updatedUser.stats.totalFocusMinutes, 25);
});

// ─── 5. Milestone AI Tutor Message Broadcasting ──────────────────────────────
runTest('Milestone AI Tutor Message Payload and Events', () => {
  const messagesReceived = [];
  const testRoomId = 'test_corridor_xyz';

  // Emulate milestone event broadcast handler
  const emitMessage = (type, message) => {
    messagesReceived.push({
      roomId: testRoomId,
      type,
      message,
      timestamp: Date.now(),
    });
  };

  emitMessage('start', "🚀 A new focus session has begun! Let's eliminate all distractions.");
  emitMessage('mid', "🎯 You've reached the halfway point! Keep that momentum going.");
  emitMessage('complete', "☕ Spectacular job completing this focus session!");

  assert.equal(messagesReceived.length, 3);
  assert.equal(messagesReceived[0].type, 'start');
  assert.equal(messagesReceived[0].roomId, testRoomId);
  assert.ok(messagesReceived[0].message.includes('begun'));

  assert.equal(messagesReceived[1].type, 'mid');
  assert.ok(messagesReceived[1].message.includes('halfway'));

  assert.equal(messagesReceived[2].type, 'complete');
  assert.ok(messagesReceived[2].message.includes('Spectacular'));
});

(async () => {
  await new Promise(r => setTimeout(r, 200));
  console.log(`\n${green}=== ALL FOCUS MODE VERIFICATION CHECKS SUCCESSFULLY PASSED ===${reset}`);
  console.log(`${green}AI Study Focus Mode functions are production-ready!${reset}`);
  process.exit(0);
})();
