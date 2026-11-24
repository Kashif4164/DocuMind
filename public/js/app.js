/**
 * DoucuMind - Frontend Application Logic
 */

// State Management
const STATE = {
  sessionId: getOrCreateSessionId(),
  theme: localStorage.getItem('doucumind_theme') || 'light',
  history: getStoredHistory(),
  isGenerating: false,
};

// DOM Elements
const dom = {
  html: document.documentElement,
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeIcon: document.getElementById('themeIcon'),
  apiStatusBadge: document.getElementById('apiStatusBadge'),
  docCountBadge: document.getElementById('docCountBadge'),
  sidebarDocCount: document.getElementById('sidebarDocCount'),
  clearChatBtn: document.getElementById('clearChatBtn'),
  clearAllDocsBtn: document.getElementById('clearAllDocsBtn'),
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  browseBtn: document.getElementById('browseBtn'),
  uploadStatus: document.getElementById('uploadStatus'),
  uploadStatusText: document.getElementById('uploadStatusText'),
  uploadProgressBar: document.getElementById('uploadProgressBar'),
  docsList: document.getElementById('docsList'),
  emptyDocsPlaceholder: document.getElementById('emptyDocsPlaceholder'),
  chatMessages: document.getElementById('chatMessages'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  typingIndicator: document.getElementById('typingIndicator'),
  chatForm: document.getElementById('chatForm'),
  queryInput: document.getElementById('queryInput'),
  sendBtn: document.getElementById('sendBtn'),
  liveToast: document.getElementById('liveToast'),
  toastMessage: document.getElementById('toastMessage'),
};

// Toast Instance
let toastInstance = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  toastInstance = new bootstrap.Toast(dom.liveToast, { delay: 4000 });
  initTheme();
  initEventListeners();
  checkApiStatus();
  fetchDocuments();
  renderChatHistory();
});

// Session ID Generation
function getOrCreateSessionId() {
  let id = localStorage.getItem('doucumind_session_id');
  if (!id) {
    id = 'sess-' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 12));
    localStorage.setItem('doucumind_session_id', id);
  }
  return id;
}

// History Management
function getStoredHistory() {
  try {
    const raw = sessionStorage.getItem('doucumind_chat_history');
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistory() {
  sessionStorage.setItem('doucumind_chat_history', JSON.stringify(STATE.history));
}

// Theme Handlers
function initTheme() {
  applyTheme(STATE.theme);
  dom.themeToggleBtn.addEventListener('click', () => {
    const nextTheme = STATE.theme === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
  });
}

function applyTheme(theme) {
  STATE.theme = theme;
  dom.html.setAttribute('data-bs-theme', theme);
  localStorage.setItem('doucumind_theme', theme);
  if (theme === 'dark') {
    dom.themeIcon.className = 'bi bi-sun-fill text-warning';
  } else {
    dom.themeIcon.className = 'bi bi-moon-stars-fill text-secondary';
  }
}

// UI Notification Toast
function showToast(message, type = 'info') {
  let icon = 'bi-info-circle-fill text-primary';
  if (type === 'success') icon = 'bi-check-circle-fill text-success';
  if (type === 'error') icon = 'bi-exclamation-triangle-fill text-danger';
  if (type === 'warning') icon = 'bi-exclamation-circle-fill text-warning';

  dom.toastMessage.innerHTML = `<i class="bi ${icon} fs-5"></i><span>${message}</span>`;
  toastInstance.show();
}

// Event Listeners
function initEventListeners() {
  // Clear Chat
  dom.clearChatBtn.addEventListener('click', () => {
    if (STATE.history.length === 0) return;
    if (confirm('Are you sure you want to clear the conversation?')) {
      STATE.history = [];
      sessionStorage.removeItem('doucumind_chat_history');
      renderChatHistory();
      showToast('Chat history cleared', 'info');
    }
  });

  // Clear All Documents
  dom.clearAllDocsBtn.addEventListener('click', async () => {
    if (!confirm('Are you sure you want to delete all indexed documents from the vector store?')) return;
    try {
      const res = await fetch('/api/docs', {
        method: 'DELETE',
        headers: { 'x-session-id': STATE.sessionId },
      });
      const data = await res.json();
      if (data.success) {
        showToast('All documents cleared from vector store', 'success');
        fetchDocuments();
      }
    } catch (err) {
      showToast(`Error clearing documents: ${err.message}`, 'error');
    }
  });

  // Upload Trigger Buttons
  dom.browseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dom.fileInput.click();
  });

  dom.dropZone.addEventListener('click', () => {
    dom.fileInput.click();
  });

  dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
      dom.fileInput.value = '';
    }
  });

  // Drag and drop events
  ['dragenter', 'dragover'].forEach((eventName) => {
    dom.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dom.dropZone.addEventListener(eventName, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.dropZone.classList.remove('dragover');
    });
  });

  dom.dropZone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files.length > 0) {
      handleFileUpload(dt.files[0]);
    }
  });

  // Chat Form Submit & Enter key handling
  dom.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitUserQuery();
  });

  dom.queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submitUserQuery();
    }
  });

  // Textarea auto resize
  dom.queryInput.addEventListener('input', () => {
    dom.queryInput.style.height = 'auto';
    dom.queryInput.style.height = Math.min(dom.queryInput.scrollHeight, 140) + 'px';
  });

  // Sample Query Buttons
  document.querySelectorAll('.sample-query-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.innerText.replace(/^"|"$/g, '').trim();
      dom.queryInput.value = text;
      submitUserQuery();
    });
  });
}

// Server Health / Status Check
async function checkApiStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.status === 'online') {
      if (data.googleApiKeyConfigured) {
        dom.apiStatusBadge.className = 'badge bg-success-subtle text-success border border-success-subtle d-flex align-items-center gap-1';
        dom.apiStatusBadge.innerHTML = `<i class="bi bi-check-circle-fill"></i> Gemini Active (${data.geminiModel})`;
      } else {
        dom.apiStatusBadge.className = 'badge bg-warning-subtle text-warning-emphasis border border-warning-subtle d-flex align-items-center gap-1';
        dom.apiStatusBadge.innerHTML = `<i class="bi bi-exclamation-triangle-fill"></i> No API Key in .env (Offline Fallback)`;
      }
    }
  } catch (err) {
    dom.apiStatusBadge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle d-flex align-items-center gap-1';
    dom.apiStatusBadge.innerHTML = `<i class="bi bi-x-circle-fill"></i> Server Offline`;
  }
}

// Upload Handling
async function handleFileUpload(file) {
  if (!file) return;

  const validExts = ['.pdf', '.docx', '.csv', '.txt'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    showToast(`Invalid file type "${ext}". Please upload a .pdf, .docx, .csv, or .txt file.`, 'error');
    return;
  }

  const maxBytes = 10 * 1024 * 1024; // 10MB
  if (file.size > maxBytes) {
    showToast(`File "${file.name}" is too large (${(file.size / (1024 * 1024)).toFixed(1)} MB). Limit is 10 MB.`, 'error');
    return;
  }

  // Show progress state
  dom.uploadStatus.classList.remove('d-none');
  dom.uploadStatusText.innerText = `Ingesting ${file.name}...`;
  dom.browseBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('sessionId', STATE.sessionId);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: {
        'x-session-id': STATE.sessionId,
      },
      body: formData,
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to upload and ingest file.');
    }

    showToast(`"${data.filename}" indexed into ${data.chunkCount} chunks!`, 'success');
    fetchDocuments();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    dom.uploadStatus.classList.add('d-none');
    dom.browseBtn.disabled = false;
  }
}

// Fetch and Render Documents
async function fetchDocuments() {
  try {
    const res = await fetch('/api/docs', {
      headers: { 'x-session-id': STATE.sessionId },
    });
    const data = await res.json();

    if (!data.success) return;

    const docs = data.documents || [];
    dom.sidebarDocCount.innerText = docs.length;
    dom.docCountBadge.innerText = `${docs.length} docs / ${data.totalChunks || 0} chunks`;

    if (docs.length === 0) {
      dom.emptyDocsPlaceholder.classList.remove('d-none');
      dom.clearAllDocsBtn.style.display = 'none';
      dom.docsList.innerHTML = '';
      dom.docsList.appendChild(dom.emptyDocsPlaceholder);
      return;
    }

    dom.emptyDocsPlaceholder.classList.add('d-none');
    dom.clearAllDocsBtn.style.display = 'inline-block';
    dom.docsList.innerHTML = '';

    docs.forEach((doc) => {
      const ext = doc.filename.split('.').pop().toLowerCase();
      let iconClass = 'bi-file-earmark-text doc-icon-txt';
      if (ext === 'pdf') iconClass = 'bi-file-earmark-pdf-fill doc-icon-pdf';
      if (ext === 'docx') iconClass = 'bi-file-earmark-word-fill doc-icon-docx';
      if (ext === 'csv') iconClass = 'bi-file-earmark-spreadsheet-fill doc-icon-csv';

      const card = document.createElement('div');
      card.className = 'doc-item p-2 mb-2 border rounded d-flex align-items-center justify-content-between';
      card.innerHTML = `
        <div class="d-flex align-items-center gap-2 overflow-hidden me-2">
          <i class="bi ${iconClass} fs-4 flex-shrink-0"></i>
          <div class="text-truncate">
            <div class="fw-medium text-truncate small" title="${doc.filename}">${escapeHtml(doc.filename)}</div>
            <div class="xx-small text-secondary">${doc.chunkCount} chunks • ${doc.totalPages || 1} pgs</div>
          </div>
        </div>
        <button class="btn btn-sm text-danger p-1 delete-doc-btn" title="Remove Document" data-filename="${encodeURIComponent(doc.filename)}">
          <i class="bi bi-x-circle"></i>
        </button>
      `;

      card.querySelector('.delete-doc-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        deleteDocument(doc.filename);
      });

      dom.docsList.appendChild(card);
    });
  } catch (err) {
    console.error('Failed to fetch documents:', err);
  }
}

// Delete Document
async function deleteDocument(filename) {
  if (!confirm(`Remove "${filename}" from the vector store?`)) return;

  try {
    const res = await fetch(`/api/docs/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: { 'x-session-id': STATE.sessionId },
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Removed "${filename}"`, 'info');
      fetchDocuments();
    }
  } catch (err) {
    showToast(`Error deleting document: ${err.message}`, 'error');
  }
}

// Submit Query to RAG Pipeline
async function submitUserQuery() {
  if (STATE.isGenerating) return;

  const query = dom.queryInput.value.trim();
  if (!query) return;

  // Clear input and reset height
  dom.queryInput.value = '';
  dom.queryInput.style.height = 'auto';

  // Add user message to UI and history
  appendMessage('user', query);
  STATE.history.push({ role: 'user', content: query });
  saveHistory();

  // Set loading state
  STATE.isGenerating = true;
  dom.sendBtn.disabled = true;
  dom.typingIndicator.classList.remove('d-none');
  scrollToBottom();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': STATE.sessionId,
      },
      body: JSON.stringify({
        query,
        history: STATE.history.slice(-6),
        sessionId: STATE.sessionId,
      }),
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Server error while generating answer.');
    }

    appendMessage('ai', data.answer, data.sources || []);
    STATE.history.push({
      role: 'assistant',
      content: data.answer,
      sources: data.sources || [],
    });
    saveHistory();
  } catch (err) {
    appendMessage('ai', `❌ **Error:** ${err.message}`);
    showToast(err.message, 'error');
  } finally {
    STATE.isGenerating = false;
    dom.sendBtn.disabled = false;
    dom.typingIndicator.classList.add('d-none');
    scrollToBottom();
  }
}

// Append Chat Message Row
function appendMessage(role, content, sources = []) {
  dom.welcomeScreen.classList.add('d-none');

  const row = document.createElement('div');
  row.className = `message-row ${role}`;

  if (role === 'user') {
    row.innerHTML = `
      <div class="bubble-user shadow-sm">${escapeHtml(content)}</div>
      <div class="avatar-sm bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center shadow-sm">
        <i class="bi bi-person-fill"></i>
      </div>
    `;
  } else {
    const parsedMarkdown = renderMarkdown(content);
    let sourcesHtml = '';

    if (sources && sources.length > 0) {
      const accordionId = 'sources-' + Math.random().toString(36).substring(2, 9);
      sourcesHtml = `
        <div class="sources-card mt-3 pt-2 border-top">
          <button class="btn btn-sm btn-outline-secondary py-0 px-2 xx-small d-flex align-items-center gap-1" type="button" data-bs-toggle="collapse" data-bs-target="#${accordionId}">
            <i class="bi bi-quote"></i> Sources & Citations (${sources.length})
            <i class="bi bi-chevron-down ms-1 xx-small"></i>
          </button>
          <div class="collapse mt-2" id="${accordionId}">
            <div class="d-flex flex-column gap-2">
              ${sources.map((s, idx) => `
                <div class="p-2 rounded bg-body-secondary border xx-small">
                  <div class="d-flex align-items-center justify-content-between mb-1">
                    <span class="badge bg-primary text-white">
                      <i class="bi bi-file-earmark-text me-1"></i>${escapeHtml(s.file)}
                    </span>
                    <span class="text-secondary fw-semibold">Page/Ref: ${s.page}</span>
                  </div>
                  <div class="source-snippet">${escapeHtml(s.snippet)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    row.innerHTML = `
      <div class="avatar-sm bg-primary text-white rounded-circle d-flex align-items-center justify-content-center shadow-sm">
        <i class="bi bi-robot"></i>
      </div>
      <div class="bubble-ai shadow-sm">
        <div class="message-content">${parsedMarkdown}</div>
        ${sourcesHtml}
        <div class="d-flex justify-content-end mt-2 pt-1 border-top border-opacity-25">
          <button class="btn btn-link text-secondary p-0 xx-small text-decoration-none copy-msg-btn" title="Copy answer">
            <i class="bi bi-clipboard me-1"></i>Copy
          </button>
        </div>
      </div>
    `;

    // Copy button event
    const copyBtn = row.querySelector('.copy-msg-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        copyBtn.innerHTML = '<i class="bi bi-check2 me-1 text-success"></i>Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy';
        }, 2000);
      });
    }
  }

  dom.chatMessages.appendChild(row);
  scrollToBottom();
}

// Render Chat History on Page Load
function renderChatHistory() {
  dom.chatMessages.querySelectorAll('.message-row').forEach((n) => n.remove());

  if (STATE.history.length === 0) {
    dom.welcomeScreen.classList.remove('d-none');
    return;
  }

  dom.welcomeScreen.classList.add('d-none');
  STATE.history.forEach((msg) => {
    appendMessage(msg.role === 'user' ? 'user' : 'ai', msg.content, msg.sources || []);
  });
  scrollToBottom();
}

// Auto Scroll to Chat Bottom
function scrollToBottom() {
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

// Simple Lightweight Markdown Parser
function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);

  // Code blocks: ```code```
  html = html.replace(/```([a-z]*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Inline code: `code`
  html = html.replace(/`([^`]+)`/g, '<code class="bg-body-secondary px-1 rounded">$1</code>');

  // Bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic: *text* or _text_
  html = html.replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');

  // Headers: ###, ##, #
  html = html.replace(/^### (.*$)/gim, '<h6 class="fw-bold mt-2 mb-1">$1</h6>');
  html = html.replace(/^## (.*$)/gim, '<h5 class="fw-bold mt-2 mb-1">$1</h5>');
  html = html.replace(/^# (.*$)/gim, '<h4 class="fw-bold mt-2 mb-1">$1</h4>');

  // Bullet items: - or *
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul class="ps-3 mb-2">$1</ul>');

  // Blockquotes: > quote
  html = html.replace(/^>\s+(.*)$/gim, '<blockquote class="border-start border-3 border-primary ps-2 text-secondary my-1">$1</blockquote>');

  // Linebreaks (preserve paragraphs)
  html = html.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>');
  html = `<p class="mb-0">${html}</p>`;

  return html;
}

// HTML Escape Helper
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
