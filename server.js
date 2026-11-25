import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import uploadRoutes from './src/routes/upload.js';
import chatRoutes from './src/routes/chat.js';
import docsRoutes from './src/routes/docs.js';
import authRoutes from './src/routes/auth.js';
import { errorHandler } from './src/middleware/errorHandler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Helper to safely send static HTML files without crashing in serverless runtimes
function safeSendFile(res, relativePath) {
  const localPath = path.join(__dirname, relativePath);
  if (fs.existsSync(localPath)) {
    return res.sendFile(localPath);
  }
  const cwdPath = path.join(process.cwd(), relativePath);
  if (fs.existsSync(cwdPath)) {
    return res.sendFile(cwdPath);
  }
  return res.status(200).send('<!-- DocuMind Static -->');
}

// Core Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Serve frontend static assets
app.use(express.static(path.join(__dirname, 'public')));

// Mount API routes
app.use('/api', uploadRoutes);
app.use('/api', chatRoutes);
app.use('/api', docsRoutes);
app.use('/api/auth', authRoutes);

// Health check route for cloud deployment monitors (Render, Railway, Fly, AWS, Vercel)
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Explicit HTML Page Routes (Local / Express fallback)
app.get('/signin', (req, res) => safeSendFile(res, 'public/signin.html'));
app.get('/login', (req, res) => res.redirect('/signin'));
app.get('/signup', (req, res) => safeSendFile(res, 'public/signup.html'));
app.get('/register', (req, res) => res.redirect('/signup'));
app.get('/chat', (req, res) => safeSendFile(res, 'public/index.html'));
app.get('/', (req, res) => safeSendFile(res, 'public/index.html'));

// Fallback to index.html for SPA-style routing if needed
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  safeSendFile(res, 'public/index.html');
});

// Central Error Handler
app.use(errorHandler);

// Start server (Only listen directly if not running in a serverless environment like Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(` 🚀 DoucuMind - RAG Document Chatbot Server`);
    console.log(` 🌐 URL: http://0.0.0.0:${PORT}`);
    const active = process.env.GROQ_API_KEY ? 'Groq' : (process.env.OPENAI_API_KEY ? 'OpenAI' : (process.env.GOOGLE_API_KEY ? 'Gemini' : 'Local'));
    console.log(` 🔑 Active Provider: ${active}`);
    console.log(` 🧠 Embeddings: ${process.env.OPENAI_EMBEDDING_MODEL || process.env.GEMINI_EMBEDDING_MODEL || 'local'}`);
    console.log(`=======================================================`);
  });
}

export default app;
