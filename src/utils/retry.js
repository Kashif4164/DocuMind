/**
 * Utility for executing an async function with exponential backoff on transient errors (e.g. 429 rate limit)
 */
export async function withRetry(fn, { maxRetries = 3, baseDelayMs = 1500, label = 'operation' } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err) {
      attempt++;
      const msg = err.message?.toLowerCase() || '';
      const isZeroCredits = msg.includes('no credits remaining') || 
                            msg.includes('insufficient_quota') ||
                            msg.includes('billing') ||
                            msg.includes('api_key_invalid') ||
                            msg.includes('api key not valid');

      const isRateLimit = (err.status === 429 || 
                          err.message?.includes('429') || 
                          msg.includes('resource has been exhausted') ||
                          msg.includes('rate limit')) && !isZeroCredits;

      if (attempt > maxRetries || !isRateLimit) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
      console.warn(`[Retry] Rate limit hit on ${label}. Retrying attempt ${attempt}/${maxRetries} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
