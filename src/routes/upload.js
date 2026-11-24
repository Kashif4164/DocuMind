import express from 'express';
import fs from 'fs';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { upload } from '../middleware/multer.js';
import { loadDocument } from '../services/loader.js';
import { getSessionVectorStore } from '../services/vectorStore.js';

const router = express.Router();

// Recursive text splitter: chunk 1000 chars, overlap 200 chars
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

/**
 * POST /api/upload
 * Handles file upload, text extraction, chunking, embedding, and vector storage
 */
router.post('/upload', upload.single('file'), async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: 'No file uploaded. Please select a .pdf, .docx, .csv, or .txt file.',
    });
  }

  const { path: tempPath, originalname } = req.file;
  const sessionId = req.headers['x-session-id'] || req.body?.sessionId;

  try {
    // Phase 2: Ingestion pipeline
    // 1. Pick loader by extension & extract text documents
    const rawDocuments = await loadDocument(tempPath, originalname);

    if (!rawDocuments || rawDocuments.length === 0) {
      return res.status(400).json({
        success: false,
        error: `Could not extract text from "${originalname}". The file may be empty or corrupted.`,
      });
    }

    // 2. Split with RecursiveCharacterTextSplitter
    const splitChunks = await textSplitter.splitDocuments(rawDocuments);

    // 3. Ensure consistent metadata on every chunk
    const enrichedChunks = splitChunks.map((chunk, index) => {
      return {
        pageContent: chunk.pageContent,
        metadata: {
          source: originalname,
          page: chunk.metadata?.page || 1,
          chunkIndex: index + 1,
          totalChunks: splitChunks.length,
          totalPages: chunk.metadata?.totalPages || 1,
        },
      };
    });

    // 4. Embed chunks and add to vector store
    const store = getSessionVectorStore(sessionId);
    await store.addDocuments(enrichedChunks);

    const summary = store.getDocumentsSummary();
    const totalChunks = store.getTotalChunks();

    res.status(200).json({
      success: true,
      filename: originalname,
      chunkCount: enrichedChunks.length,
      totalDocuments: summary.length,
      totalChunks,
      message: `Successfully processed "${originalname}" into ${enrichedChunks.length} chunks.`,
    });
  } catch (err) {
    next(err);
  } finally {
    // 5. Delete temp file after ingest
    try {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } catch (cleanupErr) {
      console.warn(`[Cleanup Warning]: Failed to delete temporary file ${tempPath}:`, cleanupErr.message);
    }
  }
});

export default router;
