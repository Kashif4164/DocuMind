import 'dotenv/config';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();
import express from 'express';
import cors from 'cors';
import path from 'path';
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

// Explicit HTML Page Routes
app.get('/signin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signin.html'));
});

app.get('/login', (req, res) => {
  res.redirect('/signin');
});

app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'signup.html'));
});

app.get('/register', (req, res) => {
  res.redirect('/signup');
});

app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Fallback to index.html for SPA-style routing if needed
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Central Error Handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(` 🚀 DoucuMind - RAG Document Chatbot Server`);
  console.log(` 🌐 URL: http://localhost:${PORT}`);
  const active = process.env.OPENAI_API_KEY ? 'OpenAI' : (process.env.GOOGLE_API_KEY ? 'Gemini' : 'Local');
  console.log(` 🔑 Active Provider: ${active}`);
  console.log(` 🧠 Embeddings: ${process.env.OPENAI_EMBEDDING_MODEL || process.env.GEMINI_EMBEDDING_MODEL || 'local'}`);
  console.log(`=======================================================`);
});
