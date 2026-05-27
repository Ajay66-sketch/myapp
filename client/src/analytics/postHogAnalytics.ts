// client/src/analytics/postHogAnalytics.ts
// Production-grade client-side analytics wrapper with referral URL capturing

let postHogApiKey = (window as any).env?.POSTHOG_API_KEY || '';

// Automatically capture and persist referral codes from URLs during session startup
if (typeof window !== 'undefined') {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const refCode = urlParams.get('ref') || urlParams.get('referral') || urlParams.get('source');
    if (refCode) {
      localStorage.setItem('capturedReferralCode', refCode);
      console.log(`🎯 Referral source captured: "${refCode}"`);
    }
  } catch (err) {
    // Fail-silent on standard server-side rendering/non-browser scopes
  }
}

export const postHogAnalytics = {
  init: (apiKey?: string) => {
    if (apiKey) {
      postHogApiKey = apiKey;
      console.log('📈 PostHog Analytics pipeline initialized successfully.');
    }
  },

  identify: (userId: string, traits: Record<string, any> = {}) => {
    console.log(`[PostHog Identify] User identified: "${userId}"`, traits);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    const token = localStorage.getItem('accessToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch('/api/v1/analytics/batch', {
      method: 'POST',
      headers,
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
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    const token = localStorage.getItem('accessToken');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch('/api/v1/analytics/batch', {
      method: 'POST',
      headers,
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
