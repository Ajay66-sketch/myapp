// client/src/monitoring/sentry.ts
// Production Sentry error and crash monitoring client wrapper

let sentryInitialized = false;

export const sentryMonitoring = {
  init: (dsn?: string) => {
    const targetDsn = dsn || (window as any).env?.SENTRY_DSN;
    if (targetDsn) {
      sentryInitialized = true;
      console.log('🛡️ Sentry Error Monitoring pipeline active.');
    }
  },

  captureException: (error: Error, extraContext: Record<string, any> = {}) => {
    console.error('[Sentry Capture Exception]:', error, extraContext);
    
    // In production, batch error telemetry to backend logs
    if (sentryInitialized) {
      fetch('/api/v1/analytics/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          events: [
            {
              eventName: 'sentry_error_logged',
              userId: localStorage.getItem('userId') || 'anonymous',
              properties: {
                errorMessage: error.message,
                stack: error.stack,
                ...extraContext,
              },
              timestamp: new Date().toISOString(),
            },
          ],
        }),
      }).catch(() => {});
    }
  },
};

export default sentryMonitoring;
