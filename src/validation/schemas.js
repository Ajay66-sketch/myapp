// src/validation/schemas.js
// Enterprise-grade type-safe runtime validations using Zod

const { z } = require('zod');

// 1. Room Join event validation
const roomJoinSchema = z.object({
  roomId: z.string().min(1, 'Room ID must be a non-empty string'),
});

// 2. Timer Start event validation (Min: 1 min, Max: 2 hours)
const timerStartSchema = z.object({
  roomId: z.string().min(1, 'Room ID must be a non-empty string'),
  duration: z.number().int().min(60, 'Duration must be at least 60 seconds').max(7200, 'Duration cannot exceed 7200 seconds'),
});

// 3. General Room command validation (Pause/Resume/Cancel)
const roomCommandSchema = z.object({
  roomId: z.string().min(1, 'Room ID must be a non-empty string'),
});

// 4. Timer payload validation for repository/state engine
const timerPayloadSchema = z.object({
  state: z.enum(['idle', 'running', 'paused', 'completed']),
  duration: z.number().int().nonnegative(),
  remainingTime: z.number().int().nonnegative(),
  endTime: z.number().int().positive().optional(),
  startSent: z.boolean().default(false),
  midSent: z.boolean().default(false),
  completeSent: z.boolean().default(false),
  lastMotivationalMin: z.number().int().nullable().optional(),
});

// 5. AI message validation
const aiMessageSchema = z.object({
  roomId: z.string().min(1),
  type: z.enum(['start', 'mid', 'complete', 'motivation']),
  message: z.string().min(1),
});

/**
 * Validate data against a schema. Throws error if validation fails.
 */
function validate(schema, data, context = 'Validation') {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errorDetails = result.error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
    const error = new Error(`[${context} Error] ${errorDetails}`);
    error.code = 'VALIDATION_FAILED';
    error.status = 400;
    
    // Emit validation failure warning to system telemetry Event Bus
    const systemEventBus = require('../telemetry/eventBus');
    systemEventBus.emit('validation:failure', 'warn', { context, errorDetails, data }, 'system');
    
    throw error;
  }
  return result.data;
}

module.exports = {
  roomJoinSchema,
  timerStartSchema,
  roomCommandSchema,
  timerPayloadSchema,
  aiMessageSchema,
  validate
};
