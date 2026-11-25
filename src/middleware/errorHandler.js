import multer from 'multer';

/**
 * Central Express error handling middleware
 */
export function errorHandler(err, req, res, next) {
  console.error('[Error Middleware]:', err);

  // Handle Multer errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        error: 'File size exceeds 10 MB limit. Please upload a smaller file.',
      });
    }
    return res.status(400).json({
      success: false,
      error: `Upload error: ${err.message}`,
    });
  }

  // Handle known client/validation errors
  const status = err.status || err.statusCode || 500;
  let message = err.message || 'An unexpected internal server error occurred.';

  // Friendly API key hint & translation of Google SDK 404 mistranslations
  if (message.includes('no credits') || message.includes('insufficient_quota') || message.includes('billing')) {
    message = 'OpenAI Error: Your OpenAI account has 0 credits remaining. Please add credits at https://platform.openai.com/settings/organization/billing, or use a free Gemini key from Google AI Studio.';
  } else if (
    message.includes('API_KEY_INVALID') || 
    message.includes('API key not valid') ||
    message.includes('not found for API version v1beta') ||
    message.includes('is not supported for embedContent') ||
    message.includes('models/text-embedding-004 is not found')
  ) {
    message = 'Invalid Google Gemini API key. Google AI Studio keys start with "AIzaSy...". The key in your .env is not recognized by Google AI Studio. Please obtain a free Gemini API key from https://aistudio.google.com/apikey and update GOOGLE_API_KEY in your .env file.';
  } else if (message.includes('Resource has been exhausted') || message.includes('quota')) {
    message = 'Gemini API rate limit or quota exceeded. Please wait a moment before trying again.';
  }

  res.status(status).json({
    success: false,
    error: message,
  });
}
