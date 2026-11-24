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

  // Friendly API key hint
  if (message.includes('API_KEY_INVALID') || message.includes('API key not valid')) {
    message = 'Invalid Google Gemini API key. Please verify your GOOGLE_API_KEY in the .env file.';
  } else if (message.includes('Resource has been exhausted') || message.includes('quota')) {
    message = 'Gemini API rate limit or quota exceeded. Please wait a moment before trying again.';
  }

  res.status(status).json({
    success: false,
    error: message,
  });
}
