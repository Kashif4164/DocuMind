import express from 'express';
import { queryRAG } from '../services/rag.js';
import { rateLimiterMiddleware, incrementQuestionCount, getRateLimitInfo, resetRateLimit } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * GET /api/chat/limit
 * Check remaining questions for current session
 */
router.get('/chat/limit', (req, res) => {
  const currentSessionId = req.headers['x-session-id'] || req.query?.sessionId;
  res.json({
    success: true,
    rateLimit: getRateLimitInfo(currentSessionId),
  });
});

/**
 * POST /api/chat/reset-limit
 * Reset question count for current session
 */
router.post('/chat/reset-limit', (req, res) => {
  const currentSessionId = req.headers['x-session-id'] || req.body?.sessionId;
  resetRateLimit(currentSessionId);
  res.json({
    success: true,
    message: 'Session rate limit reset successfully.',
    rateLimit: getRateLimitInfo(currentSessionId),
  });
});

/**
 * POST /api/chat
 * Query pipeline: receives user question and history, enforces 15 question rate limit,
 * returns grounded RAG answer, sources, and remaining questions.
 */
router.post('/chat', rateLimiterMiddleware, async (req, res, next) => {
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (e) {
        body = {};
      }
    }
    body = body || {};
    const rawQuery = body.query || body.question || body.message || req.query?.query || req.query?.question || '';
    const history = body.history || [];
    const sessionId = body.sessionId || req.query?.sessionId;

    // Validate query
    if (!rawQuery || typeof rawQuery !== 'string' || !rawQuery.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter cannot be empty.',
      });
    }

    const currentSessionId = req.headers['x-session-id'] || sessionId;

    const result = await queryRAG({
      query: rawQuery.trim(),
      history,
      sessionId: currentSessionId,
      k: 4,
    });

    // Increment question count for session
    const limitInfo = incrementQuestionCount(currentSessionId);

    res.status(200).json({
      success: true,
      answer: result.answer,
      sources: result.sources,
      provider: result.provider,
      rateLimit: limitInfo,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
