import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import uploadRoutes from './src/routes/upload.js';
import chatRoutes from './src/routes/chat.js';
import docsRoutes from './src/routes/docs.js';
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
  console.log(` 🔑 Google API Key configured: ${Boolean(process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY !== 'your_gemini_api_key_here')}`);
  console.log(`=======================================================`);
});
