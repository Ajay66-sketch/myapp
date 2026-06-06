// src/services/aiCoachService.js
const OpenAI = require('openai');

// Initialize OpenAI client (requires OPENAI_API_KEY env variable)
// In a real app, ensure this doesn't crash if env var is missing during tests
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'dummy_key',
});

/**
 * Compresses FocusSession history into a tight string for token optimization.
 */
const _compressHistory = (sessions) => {
  const totalMinutes = sessions.reduce((acc, s) => acc + s.durationMinutes, 0);
  const completedCount = sessions.filter(s => s.completedIntendedDuration).length;
  const abandonedCount = sessions.length - completedCount;
  return `Last ${sessions.length} sessions: ${totalMinutes}m total focus. ${completedCount} completed, ${abandonedCount} abandoned.`;
};

/**
 * Generates a post-session summary and productivity nudge.
 * @param {Object} user - The mongoose user document.
 * @param {Array} recentSessions - Array of the user's recent FocusSession documents.
 * @returns {Promise<Object>} The insight object { type, content }
 */
const generateSessionSummary = async (user, recentSessions) => {
  try {
    // If no valid key is provided, return fallback to prevent crashes during demo
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'dummy_key') {
      return {
        type: 'nudge',
        content: `Amazing work, ${user.username}! You've been maintaining a strong ${user.stats.currentStreak}-day streak. Keep pushing!`
      };
    }

    const historyContext = _compressHistory(recentSessions);
    
    const systemPrompt = `You are a high-performance productivity coach for students. Be concise, energetic, and empathetic. Maximum 2 sentences.`;
    const userPrompt = `
      User ${user.username} just finished a session.
      Streak: ${user.stats.currentStreak} days.
      Recent history: ${historyContext}
      Provide a highly personalized summary or burnout warning based on this context. 
      Format response as JSON: { "type": "nudge" | "burnout_warning" | "summary", "content": "The actual message" }
    `;

    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo', // optimized for speed and cost
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 100,
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result;
  } catch (error) {
    console.error('Error in AI Coach Service:', error);
    // Fallback if AI fails (e.g. rate limit)
    return {
      type: 'summary',
      content: 'Great focus session! Keep up the good work to maintain your streak.'
    };
  }
};

module.exports = {
  generateSessionSummary,
};
