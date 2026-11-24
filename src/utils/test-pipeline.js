import fs from 'fs';
import path from 'path';
import { loadDocument } from '../services/loader.js';
import { MemoryVectorStore, createEmbeddings, getSessionVectorStore } from '../services/vectorStore.js';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { queryRAG } from '../services/rag.js';

async function runTests() {
  console.log('--- Starting DoucuMind Automated Verification ---');
  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}`);
      failed++;
    }
  }

  // Test 1: Sample TXT document
  const sampleTxtPath = path.resolve('uploads/sample_test.txt');
  const sampleCsvPath = path.resolve('uploads/sample_test.csv');
  
  try {
    fs.writeFileSync(sampleTxtPath, 'Quantum computing leverages qubits, superposition, and entanglement to perform complex simulations beyond classical computers. Google Sycamore demonstrated quantum supremacy in 2019.', 'utf-8');
    fs.writeFileSync(sampleCsvPath, 'id,name,role,department\n101,Alice,ML Engineer,AI Research\n102,Bob,Cloud Architect,Infrastructure\n103,Charlie,Product Manager,Core Products\n', 'utf-8');

    // 1. Test TXT loader
    const txtDocs = await loadDocument(sampleTxtPath, 'sample_test.txt');
    assert(txtDocs.length === 1 && txtDocs[0].pageContent.includes('Quantum computing'), 'TXT Loader parses text content');

    // 2. Test CSV loader
    const csvDocs = await loadDocument(sampleCsvPath, 'sample_test.csv');
    assert(csvDocs.length === 3 && csvDocs[0].pageContent.includes('Alice'), 'CSV Loader parses rows into structured chunks');

    // 3. Test Text Splitter
    const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 100, chunkOverlap: 20 });
    const splitChunks = await splitter.splitDocuments(txtDocs);
    assert(splitChunks.length >= 1, `Text Splitter produces chunks (got ${splitChunks.length})`);

    // 4. Test MemoryVectorStore
    const testSession = 'test-session-' + Date.now();
    const store = getSessionVectorStore(testSession);
    await store.addDocuments(csvDocs);
    assert(store.getTotalChunks() === 3, 'VectorStore stores document chunks');

    // 5. Test Similarity Search
    const searchResults = await store.similaritySearchWithScore('Who is the Cloud Architect?', 2);
    assert(searchResults.length > 0, 'VectorStore similarity search returns top matches');
    assert(searchResults[0].pageContent.includes('Bob') || searchResults[0].pageContent.includes('Architect'), 'Similarity search correctly retrieves Bob the Cloud Architect');

    // 6. Test RAG Query
    const ragResult = await queryRAG({
      query: 'Who is Alice and what is her department?',
      sessionId: testSession,
    });
    assert(ragResult.sources.length > 0, 'RAG query returns citations/sources');
    assert(ragResult.sources[0].file === 'sample_test.csv', 'Citation source filename matches');

    // 7. Test Deletion & Clear
    const initialCount = store.getTotalChunks();
    store.deleteByFilename('sample_test.csv');
    assert(store.getTotalChunks() === 0, `deleteByFilename removes all chunks (was ${initialCount}, now ${store.getTotalChunks()})`);

  } catch (err) {
    console.error('Test threw an error:', err);
    failed++;
  } finally {
    // Cleanup temporary test files
    if (fs.existsSync(sampleTxtPath)) fs.unlinkSync(sampleTxtPath);
    if (fs.existsSync(sampleCsvPath)) fs.unlinkSync(sampleCsvPath);
  }

  console.log(`\nVerification Summary: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
