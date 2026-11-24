import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
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

      // Embed batch with retry
      const vectors = await withRetry(
        () => this.embeddings.embedDocuments(texts),
        { label: `embedding batch ${Math.floor(i / batchSize) + 1} of ${Math.ceil(total / batchSize)}` }
      );

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
   * Similarity search returning top-k matching documents
   * @param {string} query
   * @param {number} k
   * @returns {Promise<Array<{pageContent: string, metadata: object, score: number}>>}
   */
  async similaritySearchWithScore(query, k = 4) {
    if (this.memoryVectors.length === 0) {
      return [];
    }

    const queryEmbedding = await withRetry(
      () => this.embeddings.embedQuery(query),
      { label: 'query embedding' }
    );

    const scored = this.memoryVectors.map((entry) => {
      const score = cosineSimilarity(queryEmbedding, entry.embedding);
      return {
        pageContent: entry.content,
        metadata: entry.metadata,
        score,
      };
    });

    // Sort descending by similarity score
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /**
   * Simple similarity search returning documents
   */
  async similaritySearch(query, k = 4) {
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
 * Factory for creating configured embeddings
 */
export function createEmbeddings() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey.trim() === '') {
    console.warn('[VectorStore] No GOOGLE_API_KEY found in environment. Using local keyless embedding fallback.');
    return new LocalKeylessEmbeddings();
  }

  return new GoogleGenerativeAIEmbeddings({
    apiKey,
    modelName: process.env.GEMINI_EMBEDDING_MODEL || 'text-embedding-004',
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
