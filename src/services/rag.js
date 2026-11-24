import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getSessionVectorStore } from './vectorStore.js';
import { withRetry } from '../utils/retry.js';

/**
 * Build the system prompt enforcing strict context-only grounding
 */
function buildSystemPrompt(context) {
  return `You are a helpful, precise RAG (Retrieval-Augmented Generation) document assistant.

CRITICAL INSTRUCTIONS:
1. Answer the user's question using ONLY the provided Document Context below.
2. If the answer cannot be found in the context or if you are uncertain, truthfully say: "I do not have enough information in the uploaded documents to answer this question." Do not make up facts or extrapolate beyond what is explicitly written.
3. Keep answers clear, direct, well-structured (use bullet points or markdown where helpful).
4. When relevant, reference the source document name and page number mentioned in the context.

DOCUMENT CONTEXT:
${context}
`;
}

/**
 * Execute RAG query against the vector store
 *
 * @param {object} params
 * @param {string} params.query - User question
 * @param {Array<{role: string, content: string}>} [params.history] - Chat history
 * @param {string} [params.sessionId] - Session ID
 * @param {number} [params.k=4] - Number of chunks to retrieve
 * @returns {Promise<{answer: string, sources: Array<{file: string, page: number, snippet: string, score?: number}>}>}
 */
export async function queryRAG({ query, history = [], sessionId, k = 4 }) {
  const store = getSessionVectorStore(sessionId);

  // Check if store has documents
  if (store.getTotalChunks() === 0) {
    return {
      answer: "No documents have been uploaded yet. Please upload a PDF, DOCX, CSV, or TXT document using the upload panel before asking questions.",
      sources: [],
    };
  }

  // Retrieve top-k similar chunks
  const matches = await store.similaritySearchWithScore(query, k);

  if (matches.length === 0) {
    return {
      answer: "I couldn't find any relevant sections in the uploaded documents to answer your question.",
      sources: [],
    };
  }

  // Format context and extract sources
  const contextParts = [];
  const sources = [];

  for (let i = 0; i < matches.length; i++) {
    const { pageContent, metadata, score } = matches[i];
    const sourceName = metadata?.source || 'Document';
    const pageNum = metadata?.page || 1;

    contextParts.push(`--- Document: ${sourceName} (Page/Ref: ${pageNum}) ---\n${pageContent}\n`);

    // Create snippet (first 180 chars clean)
    const snippet = pageContent.replace(/\s+/g, ' ').trim().slice(0, 180) + (pageContent.length > 180 ? '...' : '');

    sources.push({
      file: sourceName,
      page: pageNum,
      snippet,
      score: Number(score.toFixed(4)),
    });
  }

  const contextText = contextParts.join('\n');
  const systemPrompt = buildSystemPrompt(contextText);

  // Check if Gemini API key is configured
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || apiKey === 'your_gemini_api_key_here' || apiKey.trim() === '') {
    // Return grounded excerpt if no key is configured
    return {
      answer: `⚠️ **Google API Key not detected in .env file.**\n\nHere are the most relevant excerpts found in your documents for: *"__${query}__"*\n\n` +
        sources.map((s, idx) => `**[${idx + 1}] ${s.file} (Page ${s.page}):**\n> ${s.snippet}`).join('\n\n') +
        `\n\n*Add your \`GOOGLE_API_KEY\` to the \`.env\` file to enable full AI answers.*`,
      sources,
    };
  }

  const modelName = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const llm = new ChatGoogleGenerativeAI({
    apiKey,
    modelName,
    temperature: 0.1,
    maxRetries: 2,
  });

  // Prepare messages array with System prompt, recent history (up to last 6 turns), and current Query
  const messages = [new SystemMessage(systemPrompt)];

  const recentHistory = Array.isArray(history) ? history.slice(-6) : [];
  for (const msg of recentHistory) {
    if (msg.role === 'user') {
      messages.push(new HumanMessage(msg.content));
    } else if (msg.role === 'assistant' || msg.role === 'model') {
      messages.push(new AIMessage(msg.content));
    }
  }

  messages.push(new HumanMessage(query));

  // Call LLM with retry
  const response = await withRetry(
    () => llm.invoke(messages),
    { label: 'LLM Generation' }
  );

  const answer = response?.content || "No response generated.";

  return {
    answer: typeof answer === 'string' ? answer : JSON.stringify(answer),
    sources,
  };
}
