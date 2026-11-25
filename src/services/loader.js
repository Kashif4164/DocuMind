import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { parse as parseCsv } from 'csv-parse/sync';

// Polyfills for pdfjs-dist in Node.js serverless runtimes
function ensurePdfGlobals() {
  if (typeof globalThis.DOMMatrix === 'undefined') {
    globalThis.DOMMatrix = class DOMMatrix {
      constructor() {
        this.a = 1; this.b = 0; this.c = 0; this.d = 1; this.e = 0; this.f = 0;
        this.m11 = 1; this.m12 = 0; this.m13 = 0; this.m14 = 0;
        this.m21 = 0; this.m22 = 1; this.m23 = 0; this.m24 = 0;
        this.m31 = 0; this.m32 = 0; this.m33 = 1; this.m34 = 0;
        this.m41 = 0; this.m42 = 0; this.m43 = 0; this.m44 = 1;
        this.is2D = true;
        this.isIdentity = true;
      }
      multiply() { return this; }
      translate() { return this; }
      scale() { return this; }
      transformPoint(p) { return p; }
    };
  }
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {};
  }
  if (typeof globalThis.ImageData === 'undefined') {
    globalThis.ImageData = class ImageData {};
  }
}

/**
 * Custom document class matching LangChain Document shape
 */
export class Document {
  constructor({ pageContent, metadata = {} }) {
    this.pageContent = pageContent;
    this.metadata = metadata;
  }
}

/**
 * Load and extract text documents based on file extension.
 * Supports: .pdf, .docx, .txt, .csv
 *
 * @param {string} filePath - Absolute path to uploaded file
 * @param {string} originalName - Original uploaded filename
 * @returns {Promise<Document[]>}
 */
export async function loadDocument(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  switch (ext) {
    case '.pdf':
      return await loadPdf(filePath, originalName);
    case '.docx':
      return await loadDocx(filePath, originalName);
    case '.csv':
      return await loadCsv(filePath, originalName);
    case '.txt':
      return await loadTxt(filePath, originalName);
    default:
      throw new Error(`Unsupported file type: ${ext}. Supported types: .pdf, .docx, .csv, .txt`);
  }
}

/**
 * Parse PDF page by page using pdf-parse v2
 */
async function loadPdf(filePath, originalName) {
  ensurePdfGlobals();
  const { PDFParse } = await import('pdf-parse');
  const fileBuffer = await fs.promises.readFile(filePath);
  const parser = new PDFParse({ data: new Uint8Array(fileBuffer) });
  
  let result;
  try {
    result = await parser.getText();
  } catch (err) {
    throw new Error(`Failed to read PDF file: ${err.message}`);
  } finally {
    try {
      await parser.destroy();
    } catch {
      // ignore parser cleanup errors
    }
  }

  const pages = result?.pages || [];
  const documents = [];
  let totalTextLength = 0;

  for (const page of pages) {
    const trimmed = (page.text || '').trim();
    if (trimmed.length > 0) {
      totalTextLength += trimmed.length;
      documents.push(
        new Document({
          pageContent: trimmed,
          metadata: {
            source: originalName,
            page: page.num,
            totalPages: result.total || pages.length,
          },
        })
      );
    }
  }

  if (totalTextLength === 0 || documents.length === 0) {
    throw new Error(
      `No extractable text found in "${originalName}". This may be a scanned image-only PDF, password protected, or empty. Scanned PDFs require OCR which is not supported in this lightweight pipeline.`
    );
  }

  return documents;
}

/**
 * Parse DOCX using mammoth
 */
async function loadDocx(filePath, originalName) {
  let result;
  try {
    result = await mammoth.extractRawText({ path: filePath });
  } catch (err) {
    throw new Error(`Failed to read Word document: ${err.message}`);
  }

  const rawText = (result.value || '').trim();
  if (!rawText) {
    throw new Error(`No extractable text found in Word document "${originalName}". The file may be empty or contain only embedded images.`);
  }

  return [
    new Document({
      pageContent: rawText,
      metadata: {
        source: originalName,
        page: 1,
      },
    }),
  ];
}

/**
 * Parse CSV using csv-parse
 */
async function loadCsv(filePath, originalName) {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  if (!content.trim()) {
    throw new Error(`CSV file "${originalName}" is empty.`);
  }

  let records;
  try {
    records = parseCsv(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });
  } catch (err) {
    throw new Error(`Failed to parse CSV file: ${err.message}`);
  }

  if (!records || records.length === 0) {
    throw new Error(`No data rows found in CSV file "${originalName}".`);
  }

  // Group records into chunks or rows with metadata
  const documents = [];
  // For small to medium CSVs, convert each row or batch of rows into structured text
  records.forEach((row, index) => {
    const rowNumber = index + 1;
    const rowText = Object.entries(row)
      .filter(([_, val]) => val !== undefined && val !== null && String(val).trim() !== '')
      .map(([col, val]) => `${col}: ${val}`)
      .join('\n');

    if (rowText.trim()) {
      documents.push(
        new Document({
          pageContent: `Row ${rowNumber}:\n${rowText}`,
          metadata: {
            source: originalName,
            page: rowNumber, // row number as reference page
            row: rowNumber,
          },
        })
      );
    }
  });

  return documents;
}

/**
 * Parse plain text file
 */
async function loadTxt(filePath, originalName) {
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const trimmed = content.trim();

  if (!trimmed) {
    throw new Error(`Text file "${originalName}" is empty.`);
  }

  return [
    new Document({
      pageContent: trimmed,
      metadata: {
        source: originalName,
        page: 1,
      },
    }),
  ];
}
