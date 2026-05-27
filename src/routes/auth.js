// src/routes/auth.js
// Authentication routes: Google OAuth, Signup, Login, Refresh, Logout

const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const env = require('../config/env');
const { protect } = require('../middleware/auth');
const {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  findUserByGoogleId,
  saveUser,
} = require('../utils/authStore');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Helpers: Redis Getter & Session Registration ──────────────────────────────
const getRedis = () => {
  try {
    return require('../socket').getRedisClient();
  } catch (err) {
    return null;
  }
};

const registerSessionInRedis = async (userId, refreshToken, req) => {
  const redis = getRedis();
  if (redis && redis.status === 'ready') {
    const { getClientIp } = require('../middleware/rateLimitSuspicious');
    const deviceId = req.body.deviceId || req.cookies?.deviceId || 'unknown';
    const ip = getClientIp(req);
    const userAgent = req.headers['user-agent'] || 'unknown';

    const sessionKey = `session:refresh:${userId}:${refreshToken}`;
    const sessionData = {
      userId,
      refreshToken,
      deviceId,
      ip,
      userAgent,
      lastUsed: Date.now(),
      createdAt: Date.now(),
    };
    await redis.set(sessionKey, JSON.stringify(sessionData), 'EX', 7 * 24 * 60 * 60); // 7 days
  }
};

// ─── Helpers: Generate JWTs ───────────────────────────────────────────────────
const createJwtPayload = (user, tokenType = 'access') => {
  const payload = {
    sub: user._id?.toString ? user._id.toString() : user._id,
    userId: user._id?.toString ? user._id.toString() : user._id,
    email: user.email,
    username: user.username,
    role: user.role || 'user',
    tokenType,
  };

  return payload;
};

const generateAccessToken = (user) => {
  return jwt.sign(createJwtPayload(user, 'access'), env.getJwtSecret(), {
    expiresIn: '15m',
  });
};

const generateRefreshToken = (user) => {
  return jwt.sign(createJwtPayload(user, 'refresh'), env.getJwtSecret(), {
    expiresIn: '7d',
  });
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  const isProdOrStaging = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  const secureCookie = isProdOrStaging || process.env.COOKIE_SECURE === 'true';
  const sameSiteSetting = process.env.COOKIE_SAME_SITE || 'strict';
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;

  const cookieOptions = {
    httpOnly: true,
    secure: secureCookie,
    sameSite: sameSiteSetting,
    ...(cookieDomain && { domain: cookieDomain }),
  };

  res.cookie('accessToken', accessToken, {
    ...cookieOptions,
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });
  }
};

// ─── POST /api/auth/google ────────────────────────────────────────────────────
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Google credential is required' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      if (!process.env.GOOGLE_CLIENT_ID) {
        console.warn('GOOGLE_CLIENT_ID not set. Using mock Google OAuth validation.');
        payload = jwt.decode(credential);
        if (!payload || !payload.email) {
          return res.status(400).json({ message: 'Invalid mock Google credential' });
        }
      } else {
        throw err;
      }
    }

    const { sub: googleId, email, name, picture } = payload;

    let user = await findUserByGoogleId(googleId);
    if (!user) {
      user = await findUserByEmail(email);
    }

    if (!user) {
      let baseUsername = email.split('@')[0];
      let username = baseUsername;
      let count = 1;
      while (await findUserByUsername(username)) {
        username = `${baseUsername}${count}`;
        count++;
      }

      user = await createUser({
        googleId,
        email,
        username,
        avatar: picture || '',
      });
    } else if (!user.googleId) {
      user.googleId = googleId;
      if (!user.avatar && picture) user.avatar = picture;
      await saveUser(user);
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await saveUser(user);

    await registerSessionInRedis(user._id.toString(), refreshToken, req);

    setAuthCookies(res, accessToken, refreshToken);

    const systemEventBus = require('../telemetry/eventBus');
    systemEventBus.emit('auth:action', 'info', { action: 'auth_google_login', userId: user._id.toString() }, 'security');

    const { logAuditEvent } = require('../utils/auditLogger');
    logAuditEvent({
      action: 'auth_google_login',
      userId: user._id.toString(),
      success: true,
      metadata: { ip: req.ip || req.socket.remoteAddress }
    });

    res.json({
      message: 'Google login successful',
      accessToken,
      refreshToken,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ message: 'Server error during Google login' });
  }
});

const handleRegister = async (req, res) => {
  try {
    const { name, email, password, referralCode } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return res.status(409).json({ message: 'Email is already taken' });
    }

    const existingUsername = await findUserByUsername(name);
    if (existingUsername) {
      return res.status(409).json({ message: 'Username is already taken' });
    }

    const user = await createUser({
      username: name,
      email: normalizedEmail,
      password,
    });

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await saveUser(user);

    // ─── Referral conversion and rewards ──────────────────────────────────────────
    if (referralCode) {
      try {
        let referrer = null;
        
        // Find referrer by matching formatted username
        const mongoose = require('mongoose');
        const User = require('../models/User');
        if (mongoose.connection && mongoose.connection.readyState === 1) {
          const users = await User.find({});
          referrer = users.find(u => `SCHOLAR-REF-${u.username.toUpperCase().replace(/\s+/g, '-')}` === referralCode.toUpperCase());
        } else {
          // Fallback/in-memory
          const authStore = require('../utils/authStore');
          const allUsers = await authStore.getAllUsers();
          referrer = allUsers.find(u => `SCHOLAR-REF-${u.username.toUpperCase().replace(/\s+/g, '-')}` === referralCode.toUpperCase());
        }

        if (referrer) {
          user.referralSource = referralCode;
          await saveUser(user);

          // Save Referral record
          const Referral = require('../models/Referral');
          await Referral.create({
            referrerId: referrer._id,
            referredUserId: user._id,
            referralCodeUsed: referralCode,
            status: 'rewarded',
            rewardTokensAwarded: 50
          });

          // Award Dual-Sided Focus Surge (+50 XP) rewards
          const xpService = require('../services/xpService');
          await xpService.awardXp(referrer._id, 50);
          await xpService.awardXp(user._id, 50);

          // Track referral_converted event in PostHog
          const AnalyticsService = require('../services/analyticsService');
          await AnalyticsService.track('referral_converted', user._id.toString(), {
            referrerId: referrer._id.toString(),
            referralCode,
            rewardTokensAwarded: 50
          });

          console.log(`🎯 Referral processed: ${referrer.username} referred ${user.username}. Both awarded +50 XP!`);
        }
      } catch (err) {
        console.warn('⚠️ [Referral Processing] Failed to reward referral loop:', err.message);
      }
    }

    await registerSessionInRedis(user._id.toString(), refreshToken, req);

    setAuthCookies(res, accessToken, refreshToken);

    const systemEventBus = require('../telemetry/eventBus');
    systemEventBus.emit('auth:action', 'info', { action: 'auth_register', userId: user._id.toString() }, 'security');

    const { logAuditEvent } = require('../utils/auditLogger');
    logAuditEvent({
      action: 'auth_register',
      userId: user._id.toString(),
      success: true,
      metadata: { ip: req.ip || req.socket.remoteAddress }
    });

    res.status(201).json({
      message: 'Account created successfully',
      accessToken,
      refreshToken,
      user: user.toSafeObject(),
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({ message: messages.join(', ') });
    }
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Server error during signup' });
  }
};

router.post('/register', handleRegister);
router.post('/signup', handleRegister);

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', require('../middleware/rateLimitSuspicious').checkSuspiciousBlock, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const normalizedEmail = email.toLowerCase();
    const user = await findUserByEmail(normalizedEmail);
    
    const { getClientIp, recordSuspiciousActivity } = require('../middleware/rateLimitSuspicious');
    const ip = getClientIp(req);

    if (!user) {
      await recordSuspiciousActivity(ip);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (!user.password) {
      await recordSuspiciousActivity(ip);
      return res.status(401).json({ message: 'Please login with Google' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await recordSuspiciousActivity(ip);
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    user.refreshToken = refreshToken;
    await saveUser(user);

    await registerSessionInRedis(user._id.toString(), refreshToken, req);

    setAuthCookies(res, accessToken, refreshToken);

    const systemEventBus = require('../telemetry/eventBus');
    systemEventBus.emit('auth:action', 'info', { action: 'auth_login', userId: user._id.toString() }, 'security');

    const { logAuditEvent } = require('../utils/auditLogger');
    logAuditEvent({
      action: 'auth_login',
      userId: user._id.toString(),
      success: true,
      metadata: { ip }
    });

    res.json({
      message: 'Login successful',
      accessToken,
      refreshToken,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

const handleRefresh = async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Refresh token is required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, env.getJwtSecret());
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'Refresh token has expired' });
      }
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Invalid refresh token' });
    }

    if (decoded.tokenType && decoded.tokenType !== 'refresh') {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token is not a refresh token' });
    }

    const redis = getRedis();
    const sessionKey = `session:refresh:${decoded.userId}:${refreshToken}`;
    let sessionExists = false;

    if (redis && redis.status === 'ready') {
      const activeSession = await redis.get(sessionKey);
      if (activeSession) {
        sessionExists = true;
      }
    } else {
      // Fallback to database check if Redis is offline
      const user = await findUserById(decoded.userId);
      if (user && user.refreshToken === refreshToken) {
        sessionExists = true;
      }
    }

    if (!sessionExists) {
      // REPLAY ATTACK / REUSE DETECTED!
      // Revoke all sessions for this user!
      if (redis && redis.status === 'ready') {
        const pattern = `session:refresh:${decoded.userId}:*`;
        const keys = await redis.keys(pattern);
        if (keys.length > 0) {
          await redis.del(...keys);
        }
      }

      // Record suspicious activity against this IP
      const { getClientIp, recordSuspiciousActivity } = require('../middleware/rateLimitSuspicious');
      const ip = getClientIp(req);
      await recordSuspiciousActivity(ip);

      // Audit log & Telemetry
      const systemEventBus = require('../telemetry/eventBus');
      const { logAuditEvent } = require('../utils/auditLogger');
      logAuditEvent({
        action: 'auth_replay_attack_detected',
        userId: decoded.userId,
        success: false,
        metadata: { ip }
      });
      systemEventBus.emit('auth:replay_attack', 'warn', { userId: decoded.userId, ip }, 'security');

      return res.status(401).json({ error: 'TOKEN_REUSED', message: 'Session compromised. Replay attack detected. All active sessions revoked.' });
    }

    // Happy Path: Rotate
    const user = await findUserById(decoded.userId);
    if (!user) {
      return res.status(401).json({ error: 'INVALID_TOKEN', message: 'User not found' });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // Save in database for fallback compatibility
    user.refreshToken = newRefreshToken;
    await saveUser(user);

    // Swap Redis session keys
    if (redis && redis.status === 'ready') {
      await redis.del(sessionKey);
      await registerSessionInRedis(decoded.userId, newRefreshToken, req);
    }

    setAuthCookies(res, newAccessToken, newRefreshToken);

    // Telemetry Event
    const systemEventBus = require('../telemetry/eventBus');
    systemEventBus.emit('auth:action', 'info', { action: 'auth_refresh', userId: decoded.userId }, 'security');

    res.json({
      message: 'Token refreshed successfully',
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Refresh Token Error:', error.message);
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

router.post('/refresh', handleRefresh);
router.post('/refresh-token', handleRefresh);

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    let userId = null;

    if (refreshToken) {
      const decoded = jwt.decode(refreshToken);
      if (decoded && decoded.userId) {
        userId = decoded.userId;
        const user = await findUserById(userId);
        if (user) {
          user.refreshToken = null;
          await saveUser(user);
        }

        // Revoke Redis refresh session
        const redis = getRedis();
        if (redis && redis.status === 'ready') {
          const sessionKey = `session:refresh:${userId}:${refreshToken}`;
          await redis.del(sessionKey);
        }
      }
    }

    // Blacklist access token
    let token = req.cookies?.accessToken;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.exp) {
          const expTimeSec = decoded.exp - Math.floor(Date.now() / 1000);
          if (expTimeSec > 0) {
            const { addToBlacklist } = require('../middleware/jwtBlacklist');
            await addToBlacklist(token, expTimeSec);
          }
        }
      } catch (e) {
        console.warn('[Logout] Access token decode failed for blacklist:', e.message);
      }
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    // Telemetry & Audit Logs
    const systemEventBus = require('../telemetry/eventBus');
    systemEventBus.emit('auth:action', 'info', { action: 'auth_logout', userId }, 'security');

    const { logAuditEvent } = require('../utils/auditLogger');
    logAuditEvent({
      action: 'auth_logout',
      userId,
      success: true,
      metadata: {}
    });

    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Server error during logout' });
  }
});

// ─── GET /api/auth/me — Get current logged-in user ───────────────────────────
router.get('/me', protect, async (req, res) => {
  const { password, refreshToken, ...safeUser } = req.user || {};
  res.json({ user: safeUser });
});

// ─── Scaffolding Optional 2FA Endpoints ─────────────────────────────────────
router.post('/2fa/setup', protect, async (req, res) => {
  res.json({
    message: '2FA Setup initiated. Scaffolding active.',
    secret: 'MOCK_2FA_SECRET_BASE32',
    qrCodePlaceholder: 'otpauth://totp/AIStudyFocus:student?secret=MOCK_2FA_SECRET_BASE32&issuer=AIStudyFocus'
  });
});

router.post('/2fa/verify', protect, async (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: 'Verification code is required' });
  }
  if (code === '123456') {
    return res.json({ message: '2FA verified successfully' });
  }
  res.status(400).json({ message: 'Invalid 2FA verification code' });
});

module.exports = router;
