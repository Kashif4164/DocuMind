import { ChatGroq } from '@langchain/groq';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getSessionVectorStore } from './vectorStore.js';
import { withRetry } from '../utils/retry.js';

const SYSTEM_PROMPT = `You are a document question-answering assistant. You answer questions using ONLY the context provided below, which was retrieved from the user's uploaded documents.

How to answer:
1. Write a complete, natural sentence or short paragraph. Never copy or paste raw lines from the context.
2. Start with the subject. Use the person, company, or topic name from the context (e.g. "Sam studied...", "The contract states...", "The report concludes...").
3. Be specific. Include the exact details the question asks for: names, titles, dates, numbers, places, amounts, and conditions.
4. Answer only what was asked. Do not add unrelated information.
5. If the question needs several facts, combine them from all context chunks into one clear answer.
6. For list questions (skills, projects, clauses), give a short list or a single sentence naming all items found.
7. Resolve pronouns (he, she, it, they) using names from the context.

Accuracy rules:
- Use only facts present in the context. Never guess or use outside knowledge.
- If the context only partly answers, give what is available and say what is missing.
- If the answer is not in the context, reply exactly: "I couldn't find that in the uploaded document."
- If the context has conflicting information, mention both versions.`;

export function buildSystemPrompt(context = '') {
  return SYSTEM_PROMPT;
}

/**
 * Fix 3: Query Rewriter / Expansion
 * Enriches short queries with domain synonyms (e.g. study -> education, degree, university, college)
 * so retrieval never misses critical sections like Education in resumes.
 */
export function rewriteQueryForRetrieval(query) {
  if (!query || typeof query !== 'string') return query;
  const qLower = query.toLowerCase();
  const synonyms = [];

  // Education / Study synonyms
  if (/\b(study|studied|studying|degree|qualification|qualifications|major|education|college|university|school|academic|graduated|graduation)\b/.test(qLower)) {
    synonyms.push('education degree university college qualification academic school bachelor master btech bsc diploma coursework');
  }

  // Work / Experience synonyms
  if (/\b(work|worked|working|job|career|experience|role|position|company|employment|history|title)\b/.test(qLower)) {
    synonyms.push('experience employment history company role position career work responsibilities organization');
  }

  // Skills / Tech synonyms
  if (/\b(skill|skills|tech|stack|technologies|tools|languages|frameworks|proficiencies)\b/.test(qLower)) {
    synonyms.push('skills technical tools frameworks languages technologies proficiencies abilities');
  }

  // Projects synonyms
  if (/\b(project|projects|built|build|created|developed|portfolio|system)\b/.test(qLower)) {
    synonyms.push('projects portfolio application development system architecture');
  }

  // Certifications synonyms
  if (/\b(cert|certificate|certification|certified|license|course)\b/.test(qLower)) {
    synonyms.push('certifications certificate licenses credentials training courses');
  }

  if (synonyms.length === 0) {
    return query;
  }

  return `${query} ${synonyms.join(' ')}`;
}

/**
 * Execute RAG query against the vector store with Primary (Groq) and Backup (Gemini) failover
 *
 * @param {object} params
 * @param {string} params.query - User question
 * @param {Array<{role: string, content: string}>} [params.history] - Chat history
 * @param {string} [params.sessionId] - Session ID
 * @param {number} [params.k=7] - Number of chunks to retrieve (increased to 7 to capture full resumes)
 * @returns {Promise<{answer: string, sources: Array<{file: string, page: number, snippet: string, score?: number}>, provider?: string}>}
 */
export async function queryRAG({ query, history = [], sessionId, k = 7 }) {
  const store = getSessionVectorStore(sessionId);

  // Check if store has documents
  if (store.getTotalChunks() === 0) {
    return {
      answer: "No documents have been uploaded yet. Please upload a PDF, DOCX, CSV, or TXT document using the upload panel before asking questions.",
      sources: [],
    };
  }

  // Fix 3: Query rewrite before searching to ensure all relevant sections (e.g. Education) match
  const searchExpansion = rewriteQueryForRetrieval(query.trim());
  const matches = await store.similaritySearchWithScore(searchExpansion, k);

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

    const snippet = pageContent.replace(/\s+/g, ' ').trim().slice(0, 180) + (pageContent.length > 180 ? '...' : '');

    sources.push({
      file: sourceName,
      page: pageNum,
      snippet,
      score: Number(score.toFixed(4)),
    });
  }

  const contextText = contextParts.join('\n\n---\n\n');
  const userContent = `Context:\n${contextText}\n\nQuestion:\n${query}\n\nAnswer:`;

  // Prepare messages array with System prompt, recent history, and current Query
  const messages = [new SystemMessage(SYSTEM_PROMPT)];

  const recentHistory = Array.isArray(history) ? history.slice(-4) : [];
  for (const msg of recentHistory) {
    if (msg.role === 'user') {
      messages.push(new HumanMessage(msg.content));
    } else if (msg.role === 'assistant' || msg.role === 'model') {
      messages.push(new AIMessage(msg.content));
    }
  }

  messages.push(new HumanMessage(userContent));

  // Build candidate providers in order: Primary (Groq) -> Backup (Gemini) -> OpenAI
  const candidates = [];

  // Fix 1: Pass 'model' explicitly with fallback so it can NEVER be missing
  const groqKey = process.env.GROQ_API_KEY;
  if (groqKey && groqKey.trim() !== '') {
    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    candidates.push({
      name: 'Groq',
      llm: new ChatGroq({
        apiKey: groqKey.trim(),
        model: model,
        modelName: model,
        temperature: 0.2,
        maxRetries: 1,
      }),
    });
  }

  // xAI Grok (if user provides GROK_API_KEY or XAI_API_KEY)
  const grokKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY;
  if (grokKey && grokKey.trim() !== '') {
    const model = process.env.GROK_MODEL || 'grok-beta';
    candidates.push({
      name: 'xAI Grok',
      llm: new ChatOpenAI({
        apiKey: grokKey.trim(),
        configuration: { baseURL: 'https://api.x.ai/v1' },
        model: model,
        modelName: model,
        temperature: 0.2,
        maxRetries: 1,
      }),
    });
  }

  // Backup: Google Gemini
  const geminiKey = process.env.GOOGLE_API_KEY;
  if (geminiKey && geminiKey.trim().startsWith('AIza')) {
    const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    candidates.push({
      name: 'Google Gemini (Backup)',
      llm: new ChatGoogleGenerativeAI({
        apiKey: geminiKey.trim(),
        model: model,
        modelName: model,
        temperature: 0.2,
        maxRetries: 1,
      }),
    });
  }

  // Optional: OpenAI
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey && openaiKey.trim().startsWith('sk-')) {
    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    candidates.push({
      name: 'OpenAI',
      llm: new ChatOpenAI({
        apiKey: openaiKey.trim(),
        model: model,
        modelName: model,
        temperature: 0.2,
        maxRetries: 1,
      }),
    });
  }

  // Fix 2: Visible error handling & logging (Never swallow errors or dump raw chunks)
  let response = null;
  let usedProvider = '';
  const errorDetails = [];

  for (const candidate of candidates) {
    try {
      response = await withRetry(
        () => candidate.llm.invoke(messages),
        { maxRetries: 1, label: `${candidate.name} Query` }
      );
      usedProvider = candidate.name;
      break;
    } catch (err) {
      console.error(`[RAG] ${candidate.name} failed:`, err.message);
      errorDetails.push(`${candidate.name}: ${err.message}`);
    }
  }

  if (!response) {
    console.error('[RAG] All AI providers failed:', errorDetails);
    
    // Fix 2: Return a clear, transparent error message instead of raw document chunks
    const detailsMsg = errorDetails.length > 0 
      ? errorDetails.map((e) => `- ${e}`).join('\n')
      : '- No API keys configured in .env (Add GROQ_API_KEY from https://console.groq.com)';

    return {
      answer: `Sorry, the AI service is unavailable right now.\n\n**Error logs:**\n${detailsMsg}`,
      sources,
      provider: 'Error',
    };
  }

  const rawAnswer = response?.content || "No answer generated.";
  const answer = typeof rawAnswer === 'string' ? rawAnswer : JSON.stringify(rawAnswer);

  return {
    answer,
    sources,
    provider: usedProvider,
  };
}
