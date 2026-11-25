/**
 * In-memory session rate limiter: limits each session to 15 questions
 */
const MAX_QUESTIONS_PER_SESSION = 15;
const sessionUsage = new Map(); // sessionId -> count

/**
 * Get rate limit info for a session
 */
export function getRateLimitInfo(sessionId = 'default-session') {
  const used = sessionUsage.get(sessionId) || 0;
  const remaining = Math.max(0, MAX_QUESTIONS_PER_SESSION - used);
  return {
    used,
    remaining,
    max: MAX_QUESTIONS_PER_SESSION,
    isLimited: used >= MAX_QUESTIONS_PER_SESSION,
  };
}

/**
 * Increment question count for a session
 */
export function incrementQuestionCount(sessionId = 'default-session') {
  const current = sessionUsage.get(sessionId) || 0;
  sessionUsage.set(sessionId, current + 1);
  return getRateLimitInfo(sessionId);
}

/**
 * Reset rate limit for a session (e.g. when user clears chat)
 */
export function resetRateLimit(sessionId = 'default-session') {
  sessionUsage.delete(sessionId);
}

/**
 * Express middleware to enforce 15 questions per session
 */
export function rateLimiterMiddleware(req, res, next) {
  const sessionId = req.headers['x-session-id'] || req.body?.sessionId || 'default-session';
  const info = getRateLimitInfo(sessionId);

  if (info.isLimited) {
    return res.status(429).json({
      success: false,
      error: `Rate limit reached: You have reached the maximum limit of ${MAX_QUESTIONS_PER_SESSION} questions for this session. Please click "Clear Chat" to reset your session and ask more questions.`,
      rateLimit: info,
    });
  }

  next();
}
