import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { OpenAIEmbeddings } from '@langchain/openai';
import { withRetry } from '../utils/retry.js';

/**
 * Cosine similarity between two float vectors
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Fallback lightweight keyless deterministic vectorizer (384 dims)
 * Used if no Gemini API key is provided, allowing testing and offline operation.
 */
class LocalKeylessEmbeddings {
  constructor() {
    this.dim = 384;
  }

  _vectorize(text) {
    const vec = new Float32Array(this.dim);
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    if (words.length === 0) return Array.from(vec);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      let hash = 5381;
      for (let j = 0; j < word.length; j++) {
        hash = ((hash << 5) + hash) + word.charCodeAt(j);
        hash = hash & hash;
      }
      const idx = Math.abs(hash) % this.dim;
      vec[idx] += 1;

      // also bigrams for context
      if (i > 0) {
        const bigram = `${words[i - 1]}_${word}`;
        let biHash = 5381;
        for (let k = 0; k < bigram.length; k++) {
          biHash = ((biHash << 5) + biHash) + bigram.charCodeAt(k);
          biHash = biHash & biHash;
        }
        const biIdx = Math.abs(biHash) % this.dim;
        vec[biIdx] += 1.5;
      }
    }

    // L2 Normalize
    let norm = 0;
    for (let i = 0; i < this.dim; i++) {
      norm += vec[i] * vec[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < this.dim; i++) {
        vec[i] /= norm;
      }
    }

    return Array.from(vec);
  }

  async embedDocuments(texts) {
    return texts.map((t) => this._vectorize(t));
  }

  async embedQuery(text) {
    return this._vectorize(text);
  }
}

/**
 * Checks if a string looks like an official Google AI Studio Gemini API key
 */
export function isValidGoogleApiKey(key) {
  return typeof key === 'string' && key.trim().startsWith('AIza');
}

/**
 * In-Memory Vector Store
 * Supports adding documents with metadata, similarity search with scores,
 * listing stored documents, deleting by filename, and clearing.
 */
export class MemoryVectorStore {
  constructor(embeddings) {
    this.embeddings = embeddings;
    this.memoryVectors = []; // Array of { content, embedding, metadata, id }
    this.documentMeta = new Map(); // filename -> { chunkCount, addedAt, totalPages }
  }

  /**
   * Add documents in batches with exponential backoff retry
   * @param {Array<{pageContent: string, metadata: object}>} documents
   * @param {number} batchSize
   */
  async addDocuments(documents, batchSize = 15) {
    if (!documents || documents.length === 0) return [];

    const total = documents.length;
    for (let i = 0; i < total; i += batchSize) {
      const batch = documents.slice(i, i + batchSize);
      const texts = batch.map((doc) => doc.pageContent);

      // Embed batch with retry or graceful local fallback
      let vectors;
      try {
        vectors = await withRetry(
          () => this.embeddings.embedDocuments(texts),
          { label: `embedding batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(total / batchSize)}` }
        );
      } catch (err) {
        console.warn(`[VectorStore] External embedding provider failed (${err.message}). Falling back to local keyless embeddings.`);
        this.embeddings = new LocalKeylessEmbeddings();
        vectors = await this.embeddings.embedDocuments(texts);
      }

      for (let j = 0; j < batch.length; j++) {
        const doc = batch[j];
        const vector = vectors[j];
        const source = doc.metadata?.source || 'unknown';

        this.memoryVectors.push({
          content: doc.pageContent,
          embedding: vector,
          metadata: doc.metadata || {},
          id: `${source}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        });

        // Track stats per file
        const meta = this.documentMeta.get(source) || {
          filename: source,
          chunkCount: 0,
          addedAt: new Date().toISOString(),
          totalPages: doc.metadata?.totalPages || 1,
        };
        meta.chunkCount++;
        this.documentMeta.set(source, meta);
      }
    }

    return this.memoryVectors.length;
  }

  /**
   * Similarity search returning top-k matching documents with hybrid keyword boost
   * @param {string} query
   * @param {number} k
   * @returns {Promise<Array<{pageContent: string, metadata: object, score: number}>>}
   */
  async similaritySearchWithScore(query, k = 7) {
    if (this.memoryVectors.length === 0) {
      return [];
    }

    let queryEmbedding;
    try {
      queryEmbedding = await withRetry(
        () => this.embeddings.embedQuery(query),
        { label: 'query embedding' }
      );
    } catch (err) {
      console.warn(`[VectorStore] External query embedding failed (${err.message}). Using local embedding engine.`);
      this.embeddings = new LocalKeylessEmbeddings();
      queryEmbedding = await this.embeddings.embedQuery(query);
    }

    // Extract query keywords (3+ chars) for hybrid keyword scoring
    const queryTerms = query.toLowerCase().match(/\b[a-z0-9_-]{3,}\b/g) || [];

    const scored = this.memoryVectors.map((entry) => {
      const cosine = cosineSimilarity(queryEmbedding, entry.embedding);
      let keywordBoost = 0;
      const lowerContent = entry.content.toLowerCase();
      
      for (const term of queryTerms) {
        if (lowerContent.includes(term)) {
          keywordBoost += 0.06;
        }
      }

      // Final score combining dense vector similarity + keyword match boost
      const score = cosine + Math.min(keywordBoost, 0.30);

      return {
        pageContent: entry.content,
        metadata: entry.metadata,
        score,
      };
    });

    // Sort descending by final score
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /**
   * Simple similarity search returning documents
   */
  async similaritySearch(query, k = 7) {
    const results = await this.similaritySearchWithScore(query, k);
    return results.map((r) => ({
      pageContent: r.pageContent,
      metadata: r.metadata,
    }));
  }

  /**
   * Delete documents by source filename
   * @param {string} filename
   */
  deleteByFilename(filename) {
    const beforeCount = this.memoryVectors.length;
    this.memoryVectors = this.memoryVectors.filter(
      (entry) => entry.metadata?.source !== filename
    );
    this.documentMeta.delete(filename);
    return beforeCount - this.memoryVectors.length;
  }

  /**
   * Retrieve chunks for a specific document for inspection/preview
   * @param {string} filename
   */
  getChunksByFilename(filename) {
    return this.memoryVectors
      .filter((entry) => entry.metadata?.source === filename)
      .map((entry, idx) => ({
        index: idx + 1,
        content: entry.content,
        metadata: entry.metadata,
        wordCount: (entry.content.match(/\S+/g) || []).length,
      }));
  }

  /**
   * Clear all documents from vector store
   */
  clear() {
    this.memoryVectors = [];
    this.documentMeta.clear();
  }

  /**
   * Get metadata summary of uploaded documents
   */
  getDocumentsSummary() {
    return Array.from(this.documentMeta.values());
  }

  /**
   * Total chunk count
   */
  getTotalChunks() {
    return this.memoryVectors.length;
  }
}

/**
 * Factory for creating configured embeddings (supports OpenAI, Gemini, and Local)
 */
export function createEmbeddings() {
  const openaiKey = process.env.OPENAI_API_KEY;
  const openaiModel = process.env.OPENAI_EMBEDDING_MODEL;

  if (openaiModel === 'local') {
    console.log('[VectorStore] Using local keyless embedding engine for documents.');
    return new LocalKeylessEmbeddings();
  }

  if (openaiKey && openaiKey.trim().startsWith('sk-')) {
    const model = openaiModel || 'text-embedding-3-small';
    console.log(`[VectorStore] Using OpenAI Embeddings (${model}).`);
    return new OpenAIEmbeddings({
      apiKey: openaiKey.trim(),
      modelName: model,
    });
  }

  const geminiKey = process.env.GOOGLE_API_KEY;
  const embeddingModel = process.env.GEMINI_EMBEDDING_MODEL;

  if (embeddingModel === 'local' || !geminiKey || geminiKey === 'your_gemini_api_key_here' || geminiKey.trim() === '') {
    console.warn('[VectorStore] Using local keyless embedding engine.');
    return new LocalKeylessEmbeddings();
  }

  if (!isValidGoogleApiKey(geminiKey)) {
    console.warn(`[VectorStore] Warning: GOOGLE_API_KEY does not start with "AIzaSy". Found prefix "${geminiKey.slice(0, 6)}...".`);
  }

  return new GoogleGenerativeAIEmbeddings({
    apiKey: geminiKey,
    modelName: embeddingModel || 'text-embedding-004',
  });
}

// Session-based Vector Store storage (sessionId -> MemoryVectorStore)
const sessionStores = new Map();
const DEFAULT_SESSION = 'default-session';

/**
 * Retrieve or instantiate vector store for a given session
 * @param {string} sessionId
 * @returns {MemoryVectorStore}
 */
export function getSessionVectorStore(sessionId = DEFAULT_SESSION) {
  const id = sessionId || DEFAULT_SESSION;
  if (!sessionStores.has(id)) {
    const embeddings = createEmbeddings();
    const store = new MemoryVectorStore(embeddings);
    sessionStores.set(id, store);
  }
  return sessionStores.get(id);
}

/**
 * Reset/recreate embeddings if user updates API key at runtime
 */
export function refreshSessionEmbeddings(sessionId = DEFAULT_SESSION) {
  const id = sessionId || DEFAULT_SESSION;
  const store = sessionStores.get(id);
  if (store) {
    store.embeddings = createEmbeddings();
  }
}
