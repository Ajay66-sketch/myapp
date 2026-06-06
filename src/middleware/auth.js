// src/middleware/auth.js
// JWT authentication middleware — protects private routes

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { findUserById } = require('../utils/authStore');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (token && typeof token === 'string' && (token === 'undefined' || token === 'null' || token.toLowerCase() === 'undefined' || token.toLowerCase() === 'null')) {
    token = null;
  }

  if (!token) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Authentication required' });
  }

  // Check JWT Blacklist
  const { isBlacklisted } = require('./jwtBlacklist');
  const blacklisted = await isBlacklisted(token);
  if (blacklisted) {
    return res.status(401).json({ error: 'REVOKED_TOKEN', message: 'Not authorized — token has been revoked' });
  }

  try {
    const decoded = jwt.verify(token, env.getJwtSecret());

    if (decoded.tokenType && decoded.tokenType !== 'access') {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Access token required' });
    }

    let user = await findUserById(decoded.userId);

    if (!user) {
      return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'User session not found' });
    }

    if (typeof user.select === 'function') {
      user = await user.select('-password');
    }

    if (typeof user?.toObject === 'function') {
      user = user.toObject();
    }

    const safeUser = { ...user };
    delete safeUser.password;
    delete safeUser.refreshToken;
    req.user = safeUser;

    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      console.warn(`[AUTH] JWT expired: ${error.message}. Expiry time: ${error.expiredAt}`);
      return res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'Access token has expired' });
    }

    if (error.name === 'JsonWebTokenError') {
      if (error.message === 'invalid signature') {
        console.error(`[AUTH] JWT invalid signature: ${error.message}`);
      } else if (error.message === 'jwt malformed') {
        console.error(`[AUTH] JWT malformed token structure: ${error.message}`);
      } else {
        console.error(`[AUTH] JWT verification error: ${error.message}`);
      }
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Not authorized — invalid token' });
    }

    console.error('JWT verification failed with unexpected error:', error.message);
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Not authorized — invalid token' });
  }
};

module.exports = { protect };
