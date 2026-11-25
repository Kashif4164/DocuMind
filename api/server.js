export default async function handler(req, res) {
  try {
    const { default: app } = await import('../server.js');
    return app(req, res);
  } catch (err) {
    console.error('SERVERLESS_BOOT_ERROR:', err);
    return res.status(500).json({
      error: 'SERVERLESS_BOOT_ERROR',
      message: err.message,
      stack: err.stack,
    });
  }
}
