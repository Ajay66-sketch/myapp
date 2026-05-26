// src/utils/aiContext.js
// Context compiler utility for study room attributes and chat histories

const roomStore = require('./roomStore');

/**
 * Fetch and construct structured contextual details for a study room.
 * Resolves room metadata and extracts up to the last 50 conversation entries.
 * 
 * @param {string} roomId - Room identifier
 * @returns {Promise<object>} Struct containing room details, message history, and compiled prompt text block
 */
async function buildRoomContext(roomId) {
  if (!roomId) {
    throw new Error('Room ID is required to compile AI context');
  }

  // Fetch Room from abstraction store
  const room = await roomStore.findRoomById(roomId);
  if (!room) {
    throw new Error(`Room with ID ${roomId} could not be resolved`);
  }

  // Fetch up to last 50 messages from the room history
  const messages = await roomStore.findMessagesByRoomId(roomId, 50);

  // Format historical chat logs chronologically: "Username: Message"
  const formattedLogs = messages
    .map((msg) => `- ${msg.username}: ${msg.message}`)
    .join('\n');

  // Build the compiled prompt context text block
  const contextText = `Study Room Context:
- Room Name: ${room.name}
- Room Slug: ${room.slug}
- Gated Plan Tier: ${room.tierRequired}
- Total Room Roster Count: ${room.members ? room.members.length : 0}

Chronological Room Chat Logs (last 50 messages):
${formattedLogs || '(No chat messages recorded yet in this study room.)'}
`;

  return {
    room,
    messages,
    contextText,
  };
}

module.exports = {
  buildRoomContext,
};
