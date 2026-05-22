// src/socket/utils/errors.js
// Socket.IO authentication error codes and messages

const AUTH_ERRORS = {
  // Token errors
  NO_TOKEN: {
    code: 'auth:no_token',
    message: 'No authentication token provided',
    statusCode: 401,
    action: 'redirect_to_login',
    recoverable: false,
  },
  
  INVALID_TOKEN: {
    code: 'auth:invalid_token',
    message: 'Invalid or malformed authentication token',
    statusCode: 401,
    action: 'redirect_to_login',
    recoverable: false,
  },
  
  TOKEN_EXPIRED: {
    code: 'auth:expired',
    message: 'Authentication token has expired',
    statusCode: 401,
    action: 'refresh_and_reconnect',
    recoverable: true,
  },
  
  TOKEN_EXPIRING: {
    code: 'auth:expiring',
    message: 'Authentication token expires soon',
    statusCode: 401,
    action: 'refresh_token',
    recoverable: true,
  },
  
  // Session errors
  SESSION_NOT_FOUND: {
    code: 'auth:session_not_found',
    message: 'Session not found or invalidated',
    statusCode: 401,
    action: 'redirect_to_login',
    recoverable: false,
  },
  
  SESSION_EXPIRED: {
    code: 'auth:session_expired',
    message: 'Session has expired',
    statusCode: 401,
    action: 'redirect_to_login',
    recoverable: false,
  },
  
  SESSION_REVOKED: {
    code: 'auth:session_revoked',
    message: 'Session has been revoked',
    statusCode: 401,
    action: 'redirect_to_login',
    recoverable: false,
  },
  
  // User errors
  USER_NOT_FOUND: {
    code: 'auth:user_not_found',
    message: 'User not found',
    statusCode: 401,
    action: 'redirect_to_login',
    recoverable: false,
  },
  
  USER_DISABLED: {
    code: 'auth:user_disabled',
    message: 'User account is disabled',
    statusCode: 403,
    action: 'redirect_to_login',
    recoverable: false,
  },
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: {
    code: 'auth:rate_limited',
    message: 'Too many requests, please slow down',
    statusCode: 429,
    action: 'wait_and_retry',
    recoverable: true,
  },
  
  // Permission errors
  PERMISSION_DENIED: {
    code: 'auth:permission_denied',
    message: 'Permission denied for this action',
    statusCode: 403,
    action: 'none',
    recoverable: false,
  },
  
  ROOM_NOT_FOUND: {
    code: 'auth:room_not_found',
    message: 'Room not found or access denied',
    statusCode: 404,
    action: 'none',
    recoverable: false,
  },
  
  // Device errors
  DEVICE_ID_MISMATCH: {
    code: 'auth:device_mismatch',
    message: 'Device fingerprint does not match',
    statusCode: 401,
    action: 'redirect_to_login',
    recoverable: false,
  },
};

/**
 * Get error object by code
 * @param {string} code - Error code
 * @returns {object} Error object with code, message, action
 */
const getErrorByCode = (code) => {
  const entry = Object.values(AUTH_ERRORS).find(err => err.code === code);
  return entry || AUTH_ERRORS.INVALID_TOKEN;
};

/**
 * Create error response for Socket.IO
 * @param {string} errorKey - Error key from AUTH_ERRORS
 * @param {object} additional - Additional properties to include
 * @returns {object} Error response object
 */
const createErrorResponse = (errorKey, additional = {}) => {
  const error = AUTH_ERRORS[errorKey] || AUTH_ERRORS.INVALID_TOKEN;
  
  return {
    error: error.code,
    message: error.message,
    statusCode: error.statusCode,
    action: error.action,
    recoverable: error.recoverable,
    ...additional,
  };
};

module.exports = {
  AUTH_ERRORS,
  getErrorByCode,
  createErrorResponse,
};
