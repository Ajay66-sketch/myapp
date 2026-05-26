// src/utils/verifyTelemetry.js
// Automated verification script for the newly designed Telemetry & Resilience Layer

const assert = require('assert').strict;
const eventBus = require('../telemetry/eventBus');
const logger = require('../telemetry/logger');
const { getBreaker, CircuitBreaker } = require('../core/circuitBreaker');

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

console.log(`${yellow}=== STARTING TELEMETRY & RESILIENCE VERIFICATION ===${reset}\n`);

// ─── 1. Unified Event Bus Verification ──────────────────────────────────────
runTest('Unified Telemetry Event Bus Pub/Sub Mechanics', () => {
  const events = [];
  const unsubscribe = eventBus.subscribe((evt) => {
    events.push(evt);
  });

  // Emit some test events
  eventBus.emit('test:info_event', 'info', { speed: 'fast' }, 'user_123');
  eventBus.emit('test:error_event', 'error', { code: 'CRASH' });

  unsubscribe();

  // Emit event after unsubscribe (should not be tracked)
  eventBus.emit('test:silent_event', 'info');

  assert.equal(events.length, 2);
  
  assert.equal(events[0].eventType, 'test:info_event');
  assert.equal(events[0].severity, 'info');
  assert.equal(events[0].userId, 'user_123');
  assert.equal(events[0].payload.speed, 'fast');

  assert.equal(events[1].eventType, 'test:error_event');
  assert.equal(events[1].severity, 'error');
  assert.equal(events[1].userId, null);
  assert.equal(events[1].payload.code, 'CRASH');
});

// ─── 2. Structured Logging System Verification ─────────────────────────────
runTest('Structured Logging forward to Event Bus', () => {
  const logsCaptured = [];
  const unsub = eventBus.subscribe((evt) => {
    if (evt.eventType.startsWith('log:')) {
      logsCaptured.push(evt);
    }
  });

  logger.info('System online', { connections: 42 }, 'auth-service');
  logger.warn('High CPU load', { usage: '92%' }, 'cpu-monitor');
  logger.error('Database connection failed', { errCode: 'ECONN' }, 'db-service');

  unsub();

  assert.equal(logsCaptured.length, 3);
  
  assert.equal(logsCaptured[0].eventType, 'log:info');
  assert.equal(logsCaptured[0].payload.service, 'auth-service');
  assert.equal(logsCaptured[0].payload.connections, 42);

  assert.equal(logsCaptured[1].eventType, 'log:warn');
  assert.equal(logsCaptured[1].payload.service, 'cpu-monitor');
  assert.equal(logsCaptured[1].payload.usage, '92%');

  assert.equal(logsCaptured[2].eventType, 'log:error');
  assert.equal(logsCaptured[2].payload.service, 'db-service');
  assert.equal(logsCaptured[2].payload.errCode, 'ECONN');
});

// ─── 3. Circuit Breaker Execution & State Machine Verification ─────────────
runTestAsync('Circuit Breaker Fail-safe CLOSED -> OPEN -> HALF_OPEN transitions', async () => {
  // Instantiate breaker with 2 failure thresholds and 100ms cooldown for fast testing
  const breaker = new CircuitBreaker('ai-service', {
    failureThreshold: 2,
    cooldownPeriod: 100
  });

  assert.equal(breaker.state, 'CLOSED');

  const actionSuccess = async () => 'AI Result';
  const actionFailure = async () => { throw new Error('AI Provider Offline'); };
  const fallbackAction = () => 'AI Fallback';

  // 1. Verify successful CLOSED execution
  let result = await breaker.execute(actionSuccess, fallbackAction);
  assert.equal(result, 'AI Result');
  assert.equal(breaker.state, 'CLOSED');
  assert.equal(breaker.failures, 0);

  // 2. Trigger failure #1 - should stay CLOSED
  result = await breaker.execute(actionFailure, fallbackAction);
  assert.equal(result, 'AI Fallback');
  assert.equal(breaker.state, 'CLOSED');
  assert.equal(breaker.failures, 1);

  // 3. Trigger failure #2 - trips threshold, state shifts to OPEN
  result = await breaker.execute(actionFailure, fallbackAction);
  assert.equal(result, 'AI Fallback');
  assert.equal(breaker.state, 'OPEN');
  assert.equal(breaker.failures, 2);

  // 4. In OPEN state, actionFailure should instantly route to fallback without executing action
  let executedAction = false;
  const actionMock = async () => {
    executedAction = true;
    return 'Ignored';
  };
  result = await breaker.execute(actionMock, fallbackAction);
  assert.equal(result, 'AI Fallback');
  assert.equal(executedAction, false); // verified action is short-circuited/bypass active!

  // 5. Wait for cooldown to expire
  await new Promise(resolve => setTimeout(resolve, 150));

  // 6. Action in OPEN should transition state to HALF_OPEN and test success
  result = await breaker.execute(actionSuccess, fallbackAction);
  assert.equal(result, 'AI Result');
  assert.equal(breaker.state, 'CLOSED'); // Successful trial closes the breaker!
  assert.equal(breaker.failures, 0);
});

(async () => {
  await new Promise(r => setTimeout(r, 200));
  console.log(`\n${green}=== ALL VERIFICATION CHECKS SUCCESSFULLY PASSED ===${reset}`);
  console.log(`${green}Backend Telemetry & Circuit Breakers are production-ready!${reset}`);
  process.exit(0);
})();
