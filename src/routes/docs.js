import express from 'express';
import { getSessionVectorStore } from '../services/vectorStore.js';
import { resetRateLimit } from '../middleware/rateLimiter.js';

const router = express.Router();

/**
 * GET /api/docs
 * List uploaded documents and statistics
 */
router.get('/docs', (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.query.sessionId;
  const store = getSessionVectorStore(sessionId);

  const docs = store.getDocumentsSummary();
  const totalChunks = store.getTotalChunks();

  res.status(200).json({
    success: true,
    documents: docs,
    totalDocuments: docs.length,
    totalChunks,
  });
});

/**
 * DELETE /api/docs
 * Reset/wipe the vector store (clear all documents) and reset rate limit
 */
router.delete('/docs', (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.body?.sessionId;
  const store = getSessionVectorStore(sessionId);

  store.clear();
  resetRateLimit(sessionId);

  res.status(200).json({
    success: true,
    message: 'All documents have been removed from the vector store.',
    totalDocuments: 0,
    totalChunks: 0,
  });
});

/**
 * DELETE /api/docs/:filename
 * Remove a specific document from the vector store
 */
router.delete('/docs/:filename', (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.body?.sessionId;
  const store = getSessionVectorStore(sessionId);
  const { filename } = req.params;

  const removedCount = store.deleteByFilename(filename);

  res.status(200).json({
    success: true,
    message: `Removed "${filename}" (${removedCount} chunks deleted).`,
    removedChunks: removedCount,
    remainingDocuments: store.getDocumentsSummary(),
  });
});

/**
 * GET /api/docs/:filename/chunks
 * Inspect chunks of a specific document
 */
router.get('/docs/:filename/chunks', (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.query.sessionId;
  const store = getSessionVectorStore(sessionId);
  const { filename } = req.params;

  const chunks = store.getChunksByFilename ? store.getChunksByFilename(filename) : [];

  res.status(200).json({
    success: true,
    filename,
    totalChunks: chunks.length,
    chunks,
  });
});

/**
 * GET /api/status
 * Server health check and API key readiness
 */
router.get('/status', (req, res) => {
  const groqKey = process.env.GROQ_API_KEY;
  const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  const geminiKey = process.env.GOOGLE_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  const isGroq = Boolean(groqKey && groqKey.trim() !== '');
  const isGrok = Boolean(grokKey && grokKey.trim() !== '');
  const isGemini = Boolean(geminiKey && geminiKey.trim().startsWith('AIza'));
  const isOpenAi = Boolean(openaiKey && openaiKey.trim().startsWith('sk-'));

  let primary = 'Local Excerpts';
  if (isGroq) primary = `Groq (${process.env.GROQ_MODEL || 'llama-3.3-70b'})`;
  else if (isGrok) primary = `xAI Grok (${process.env.GROK_MODEL || 'grok-beta'})`;
  else if (isOpenAi) primary = `OpenAI (${process.env.OPENAI_MODEL || 'gpt-4o-mini'})`;

  let backup = isGemini ? `Gemini (${process.env.GEMINI_MODEL || 'gemini-1.5-flash'})` : null;

  res.status(200).json({
    status: 'online',
    primary,
    backup,
    isGroqConfigured: isGroq,
    isGrokConfigured: isGrok,
    isGeminiConfigured: isGemini,
    isOpenAiConfigured: isOpenAi,
    embeddingModel: process.env.OPENAI_EMBEDDING_MODEL || process.env.GEMINI_EMBEDDING_MODEL || 'local',
  });
});

export default router;

