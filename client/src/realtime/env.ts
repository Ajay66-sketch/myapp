const VITE_API_URL = import.meta.env.VITE_API_URL;
const VITE_SOCKET_URL = import.meta.env.VITE_SOCKET_URL;
const MODE = import.meta.env.MODE || 'development';

function validateClientEnv() {
  const missingVars: string[] = [];

  if (!VITE_API_URL) {
    missingVars.push('VITE_API_URL');
  }
  if (!VITE_SOCKET_URL) {
    missingVars.push('VITE_SOCKET_URL');
  }

  // Fail-fast in production builds; in development, warn and allow local defaults
  if (missingVars.length > 0) {
    const msg = `Missing frontend env vars: ${missingVars.join(', ')}.`;
    if (MODE === 'production') {
      throw new Error(msg + ' Set them in your deployment environment before building.');
    } else {
      console.warn('⚠️', msg, 'Using local fallbacks for development.');
    }
  }
}

validateClientEnv();

export { VITE_API_URL, VITE_SOCKET_URL, validateClientEnv };
