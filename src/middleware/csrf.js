// src/middleware/csrf.js
// Custom Double-Submit Cookie CSRF Protection Middleware
// Completely stateless and works perfectly for single page apps (SPA)

const crypto = require('crypto');

/**
 * Generate a cryptographically secure random token
 */
const generateCsrfToken = () => {
  return crypto.randomBytes(24).toString('hex');
};

/**
 * CSRF Protection Middleware
 */
const csrfProtection = (req, res, next) => {
  // Exempt billing webhook endpoints from CSRF validation
  const isBillingWebhook = (req.originalUrl && (req.originalUrl.includes('/webhook') || req.originalUrl.includes('/billing/webhook'))) ||
                           (req.path && (req.path.includes('/webhook') || req.path.includes('/billing/webhook')));
  if (isBillingWebhook) {
    return next();
  }

  // 1. Skip validation if explicitly disabled in dev mode
  const disableCsrf = process.env.DISABLE_CSRF === 'true';
  
  // 2. Manage setting the token cookie
  let csrfCookieToken = req.cookies?.csrfToken;
  if (!csrfCookieToken) {
    csrfCookieToken = generateCsrfToken();
    const isProdOrStaging = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    
    // Set cookie. Must NOT be httpOnly so that frontend client code can read it and send it back as a header!
    res.cookie('csrfToken', csrfCookieToken, {
      httpOnly: false, // Must be false for double-submit cookie pattern
      secure: isProdOrStaging || process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
  }

  // 3. Define state-changing HTTP methods requiring validation
  const stateChangingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

  if (stateChangingMethods.includes(req.method) && !disableCsrf) {
    // Only validate CSRF if the request has auth credentials (JWT Bearer token or accessToken cookie)
    let hasAuthToken = false;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      const token = req.headers.authorization.split(' ')[1];
      if (token && token !== 'undefined' && token !== 'null') {
        hasAuthToken = true;
      }
    } else if (req.cookies && req.cookies.accessToken) {
      const token = req.cookies.accessToken;
      if (token && token !== 'undefined' && token !== 'null') {
        hasAuthToken = true;
      }
    }

    if (hasAuthToken) {
      const csrfHeaderToken = req.headers['x-csrf-token'] || req.headers['x-xsrf-token'];
      
      // Validate tokens match
      if (!csrfCookieToken || !csrfHeaderToken || csrfCookieToken !== csrfHeaderToken) {
        console.warn(`[Security Warning] CSRF token mismatch/missing on ${req.method} ${req.originalUrl}. Cookie: ${csrfCookieToken ? 'Present' : 'Missing'}, Header: ${csrfHeaderToken ? 'Present' : 'Missing'}`);
        return res.status(403).json({
          status: 'error',
          error: 'CSRF_VALIDATION_FAILED',
          message: 'Invalid or missing CSRF token'
        });
      }
    }
  }

  next();
};

module.exports = csrfProtection;
