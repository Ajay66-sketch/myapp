// src/routes/auth.js
// Authentication routes: Google OAuth, Signup, Login, Refresh, Logout

const express = require('express');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─── Helpers: Generate JWTs ───────────────────────────────────────────────────
const generateAccessToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
};

const generateRefreshToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

const setAuthCookies = (res, accessToken, refreshToken) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  res.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge: 15 * 60 * 1000, // 15 minutes
  });

  if (refreshToken) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
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
      // Mock validation for local development if GOOGLE_CLIENT_ID is not provided
      if (!process.env.GOOGLE_CLIENT_ID) {
        console.warn('GOOGLE_CLIENT_ID not set. Using mock Google OAuth validation.');
        // Decode the JWT without verification just for the mock
        payload = jwt.decode(credential);
        if (!payload || !payload.email) {
          return res.status(400).json({ message: 'Invalid mock Google credential' });
        }
      } else {
        throw err;
      }
    }

    const { sub: googleId, email, name, picture } = payload;

    // Check if user exists by googleId or email
    let user = await User.findOne({ $or: [{ googleId }, { email }] });

    if (!user) {
      // Create new user if they don't exist
      // Since username must be unique, generate a base username and append random string if needed
      let baseUsername = email.split('@')[0];
      let username = baseUsername;
      let count = 1;
      while (await User.exists({ username })) {
        username = `${baseUsername}${count}`;
        count++;
      }

      user = await User.create({
        googleId,
        email,
        username,
        avatar: picture || '',
      });
    } else if (!user.googleId) {
      // Link Google account to existing email user
      user.googleId = googleId;
      if (!user.avatar && picture) user.avatar = picture;
      await user.save();
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      message: 'Google login successful',
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Google Auth Error:', error);
    res.status(500).json({ message: 'Server error during Google login' });
  }
});

// ─── POST /api/auth/signup ────────────────────────────────────────────────────
router.post('/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { username }],
    });

    if (existingUser) {
      const field = existingUser.email === email ? 'Email' : 'Username';
      return res.status(409).json({ message: `${field} is already taken` });
    }

    const user = await User.create({ username, email, password });

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      message: 'Account created successfully',
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
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // if user signed up with Google, they might not have a password
    if (!user.password) {
      return res.status(401).json({ message: 'Please login with Google' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    user.refreshToken = refreshToken;
    await user.save();

    setAuthCookies(res, accessToken, refreshToken);

    res.json({
      message: 'Login successful',
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Server error during login' });
  }
});

// ─── POST /api/auth/refresh-token ─────────────────────────────────────────────
router.post('/refresh-token', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);

    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const newAccessToken = generateAccessToken(user._id);
    const newRefreshToken = generateRefreshToken(user._id);

    user.refreshToken = newRefreshToken;
    await user.save();

    setAuthCookies(res, newAccessToken, newRefreshToken);

    res.json({
      message: 'Token refreshed successfully',
      user: user.toSafeObject(),
    });
  } catch (error) {
    console.error('Refresh Token Error:', error.message);
    res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  try {
    const { refreshToken } = req.cookies;
    
    if (refreshToken) {
      // Invalidate the token in the database
      const decoded = jwt.decode(refreshToken);
      if (decoded && decoded.userId) {
        await User.findByIdAndUpdate(decoded.userId, { refreshToken: null });
      }
    }

    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ message: 'Server error during logout' });
  }
});

// ─── GET /api/auth/me — Get current logged-in user ───────────────────────────
router.get('/me', protect, async (req, res) => {
  res.json({ user: req.user.toSafeObject() });
});

module.exports = router;
