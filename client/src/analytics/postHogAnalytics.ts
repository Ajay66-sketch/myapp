// client/src/analytics/postHogAnalytics.ts
// Production analytics event logging client wrapper

let postHogApiKey = (window as any).env?.POSTHOG_API_KEY || '';

export const postHogAnalytics = {
  init: (apiKey?: string) => {
    if (apiKey) {
      postHogApiKey = apiKey;
      console.log('📈 PostHog Analytics pipeline initialized successfully.');
    }
  },

  identify: (userId: string, traits: Record<string, any> = {}) => {
    console.log(`[PostHog Identify] User identified: "${userId}"`, traits);
    // Secure webhook/batch dispatch to backend analytics
    fetch('/api/v1/analytics/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: [
          {
            eventName: 'user_identified',
            userId,
            properties: traits,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    }).catch(() => {});
  },

  track: (eventName: string, properties: Record<string, any> = {}) => {
    console.log(`[PostHog Track] Event: "${eventName}"`, properties);
    
    // Batch dispatch directly to our Mongoose Analytics DB
    fetch('/api/v1/analytics/batch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
      },
      body: JSON.stringify({
        events: [
          {
            eventName,
            userId: localStorage.getItem('userId') || 'anonymous',
            properties,
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    }).catch(() => {});
  },
};

export default postHogAnalytics;
