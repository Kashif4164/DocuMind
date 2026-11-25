import express from 'express';
import {
  registerUser,
  authenticateUser,
  getUserByToken,
  destroySession,
} from '../services/userService.js';

const router = express.Router();

/**
 * POST /api/auth/signup
 */
router.post('/signup', (req, res) => {
  const { name, email, password } = req.body || {};
  const result = registerUser({ name, email, password });

  if (!result.success) {
    return res.status(400).json({ success: false, error: result.error });
  }

  res.status(201).json({
    success: true,
    message: 'Account created successfully.',
    user: result.user,
    token: result.token,
  });
});

/**
 * POST /api/auth/signin
 */
router.post('/signin', (req, res) => {
  const { email, password } = req.body || {};
  const result = authenticateUser({ email, password });

  if (!result.success) {
    return res.status(401).json({ success: false, error: result.error });
  }

  res.status(200).json({
    success: true,
    message: 'Signed in successfully.',
    user: result.user,
    token: result.token,
  });
});

/**
 * GET /api/auth/me
 */
router.get('/me', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token =
    (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null) ||
    req.headers['x-auth-token'] ||
    req.query.token;

  if (!token) {
    return res.status(200).json({ success: true, authenticated: false, user: null });
  }

  const user = getUserByToken(token);
  if (!user) {
    return res.status(200).json({ success: true, authenticated: false, user: null });
  }

  res.status(200).json({
    success: true,
    authenticated: true,
    user,
  });
});

/**
 * POST /api/auth/signout
 */
router.post('/signout', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token =
    (authHeader && authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null) ||
    req.headers['x-auth-token'] ||
    req.body?.token;

  if (token) {
    destroySession(token);
  }

  res.status(200).json({
    success: true,
    message: 'Signed out successfully.',
  });
});

export default router;
