import express from 'express';
import { queryRAG } from '../services/rag.js';

const router = express.Router();

/**
 * POST /api/chat
 * Query pipeline: receives user question and history, returns grounded RAG answer & sources
 */
router.post('/chat', async (req, res, next) => {
  try {
    const { query, history = [], sessionId } = req.body;

    // Validate query
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter cannot be empty.',
      });
    }

    const currentSessionId = req.headers['x-session-id'] || sessionId;

    const result = await queryRAG({
      query: query.trim(),
      history,
      sessionId: currentSessionId,
      k: 4,
    });

    res.status(200).json({
      success: true,
      answer: result.answer,
      sources: result.sources,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
