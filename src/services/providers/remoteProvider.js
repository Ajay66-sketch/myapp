// src/services/providers/remoteProvider.js
// Common remote provider request helper with exponential backoff retries.

const aiConfig = require('../../config/ai');

async function callRemoteProvider(url, headers, body, retries = aiConfig.retryCounts, delay = 1000, signal = null) {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
    }

    return response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error; // Propagate cancellation immediately without retrying
    }
    if (retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      return callRemoteProvider(url, headers, body, retries - 1, delay * 2, signal);
    }
    throw error;
  }
}

module.exports = {
  callRemoteProvider,
};
