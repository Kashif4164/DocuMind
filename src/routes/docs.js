import express from 'express';
import { getSessionVectorStore } from '../services/vectorStore.js';

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
 * Reset/wipe the vector store (clear all documents)
 */
router.delete('/docs', (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.body?.sessionId;
  const store = getSessionVectorStore(sessionId);

  store.clear();

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
 * GET /api/status
 * Server health check and API key readiness
 */
router.get('/status', (req, res) => {
  const apiKey = process.env.GOOGLE_API_KEY;
  const hasKey = Boolean(apiKey && apiKey !== 'your_gemini_api_key_here' && apiKey.trim() !== '');

  res.status(200).json({
    status: 'online',
    googleApiKeyConfigured: hasKey,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
  });
});

export default router;
