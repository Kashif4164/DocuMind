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
      const isRateLimit = err.status === 429 || 
                          err.message?.includes('429') || 
                          err.message?.toLowerCase().includes('resource has been exhausted') ||
                          err.message?.toLowerCase().includes('rate limit');

      if (attempt > maxRetries || !isRateLimit) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 500);
      console.warn(`[Retry] Rate limit hit on ${label}. Retrying attempt ${attempt}/${maxRetries} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
