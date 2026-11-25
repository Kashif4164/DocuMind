/**
 * DocuMind - ChatGPT/Claude Style Session Management & Editorial UI Logic
 */

const STORAGE_KEYS = {
  SESSIONS: 'documind_chat_sessions',
  ACTIVE_SESSION_ID: 'documind_active_session_id',
  THEME: 'documind_theme',
};

// Application State
const STATE = {
  sessions: loadStoredSessions(),
  activeSessionId: null,
  theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'light',
  isGenerating: false,
};

// DOM References
const dom = {
  html: document.documentElement,
  historySidebar: document.getElementById('historySidebar'),
  toggleSidebarBtn: document.getElementById('toggleSidebarBtn'),
  closeSidebarBtn: document.getElementById('closeSidebarBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  historyList: document.getElementById('historyList'),
  themeToggleBtn: document.getElementById('themeToggleBtn'),
  themeIcon: document.getElementById('themeIcon'),
  apiStatusBadge: document.getElementById('apiStatusBadge'),
  modelStatusText: document.getElementById('modelStatusText'),
  rateLimitBadge: document.getElementById('rateLimitBadge'),
  rateLimitFooter: document.getElementById('rateLimitFooter'),
  stepDocs: document.getElementById('stepDocs'),
  stepChat: document.getElementById('stepChat'),
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  browseBtn: document.getElementById('browseBtn'),
  uploadStatus: document.getElementById('uploadStatus'),
  docStatsLabel: document.getElementById('docStatsLabel'),
  clearAllDocsBtn: document.getElementById('clearAllDocsBtn'),
  docsList: document.getElementById('docsList'),
  chatMessages: document.getElementById('chatMessages'),
  defaultWelcome: document.getElementById('defaultWelcome'),
  typingIndicator: document.getElementById('typingIndicator'),
  chatForm: document.getElementById('chatForm'),
  queryInput: document.getElementById('queryInput'),
  sendBtn: document.getElementById('sendBtn'),
  liveToast: document.getElementById('liveToast'),
  toastMessage: document.getElementById('toastMessage'),
};

let toastInstance = null;

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
  toastInstance = new bootstrap.Toast(dom.liveToast, { delay: 4000 });
  initTheme();
  initSessions();
  initEventListeners();
  checkApiStatus();
  fetchRateLimit();
  fetchDocuments();
});

// Theme Management
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
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  dom.themeIcon.className = theme === 'dark' ? 'bi bi-sun text-warning' : 'bi bi-moon-stars';
}

// Session (ChatGPT/Claude Style History) Management
function loadStoredSessions() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SESSIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveSessions() {
  localStorage.setItem(STORAGE_KEYS.SESSIONS, JSON.stringify(STATE.sessions));
}

function initSessions() {
  const savedActiveId = localStorage.getItem(STORAGE_KEYS.ACTIVE_SESSION_ID);
  if (savedActiveId && STATE.sessions.some((s) => s.id === savedActiveId)) {
    switchSession(savedActiveId);
  } else if (STATE.sessions.length > 0) {
    switchSession(STATE.sessions[0].id);
  } else {
    createNewChat(false);
  }
  renderHistorySidebar();
}

function createNewChat(autoFocus = true) {
  const newId = 'chat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7);
  const session = {
    id: newId,
    title: 'New chat',
    createdAt: new Date().toISOString(),
    messages: [],
  };
  STATE.sessions.unshift(session);
  saveSessions();
  switchSession(newId);
  renderHistorySidebar();

  if (autoFocus && dom.queryInput) {
    dom.queryInput.focus();
  }
}

function switchSession(sessionId) {
  STATE.activeSessionId = sessionId;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_SESSION_ID, sessionId);
  renderHistorySidebar();
  renderCurrentSessionMessages();
  fetchRateLimit();
  fetchDocuments();
}

function deleteSession(sessionId, e) {
  if (e) e.stopPropagation();
  STATE.sessions = STATE.sessions.filter((s) => s.id !== sessionId);
  saveSessions();

  if (STATE.activeSessionId === sessionId) {
    if (STATE.sessions.length > 0) {
      switchSession(STATE.sessions[0].id);
    } else {
      createNewChat(false);
    }
  } else {
    renderHistorySidebar();
  }
}

function getActiveSession() {
  return STATE.sessions.find((s) => s.id === STATE.activeSessionId);
}

// Render History in Left Sidebar
function renderHistorySidebar() {
  dom.historyList.innerHTML = '';

  if (STATE.sessions.length === 0) {
    dom.historyList.innerHTML = '<div class="text-secondary xx-small px-2 py-3">No conversations yet.</div>';
    return;
  }

  STATE.sessions.forEach((s) => {
    const item = document.createElement('div');
    const isActive = s.id === STATE.activeSessionId;
    item.className = `history-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <div class="d-flex align-items-center gap-2 overflow-hidden">
        <i class="bi bi-chat-text text-secondary xx-small"></i>
        <span class="history-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span>
      </div>
      <button class="history-delete-btn" title="Delete chat">
        <i class="bi bi-trash3 xx-small"></i>
      </button>
    `;

    item.addEventListener('click', () => switchSession(s.id));
    item.querySelector('.history-delete-btn').addEventListener('click', (e) => deleteSession(s.id, e));

    dom.historyList.appendChild(item);
  });
}

// Render Messages for Active Session
function renderCurrentSessionMessages() {
  // Clear message DOM except typing indicator
  dom.chatMessages.querySelectorAll('.user-msg-row, .ai-msg-row').forEach((n) => n.remove());

  const session = getActiveSession();
  const messages = session ? session.messages : [];

  if (!messages || messages.length === 0) {
    dom.defaultWelcome.classList.remove('d-none');
    dom.stepChat.classList.remove('active');
    return;
  }

  dom.defaultWelcome.classList.add('d-none');
  dom.stepChat.classList.add('active');

  messages.forEach((msg) => {
    appendMessageToDOM(msg.role, msg.content, msg.sources || [], msg.meta || {});
  });

  scrollToBottom();
}

// Event Listeners
function initEventListeners() {
  // Sidebar Toggle (Mobile & Desktop)
  dom.toggleSidebarBtn.addEventListener('click', () => {
    dom.historySidebar.classList.toggle('collapsed');
  });

  if (dom.closeSidebarBtn) {
    dom.closeSidebarBtn.addEventListener('click', () => {
      dom.historySidebar.classList.add('collapsed');
    });
  }

  // New Chat
  dom.newChatBtn.addEventListener('click', () => {
    createNewChat(true);
  });

  // Browse file trigger
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
  ['dragenter', 'dragover'].forEach((name) => {
    dom.dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dom.dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((name) => {
    dom.dropZone.addEventListener(name, (e) => {
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

  // Clear all docs
  dom.clearAllDocsBtn.addEventListener('click', async () => {
    if (!confirm('Clear all indexed documents from this session?')) return;
    try {
      const res = await fetch('/api/docs', {
        method: 'DELETE',
        headers: { 'x-session-id': STATE.activeSessionId },
      });
      const data = await res.json();
      if (data.success) {
        showToast('All documents removed from session store', 'info');
        fetchDocuments();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Chat Form Submit
  dom.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitUserQuery();
  });

  // Sample Query Chips
  document.querySelectorAll('.sample-query-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      dom.queryInput.value = q;
      submitUserQuery();
    });
  });
}

// Upload Handling
async function handleFileUpload(file) {
  if (!file) return;

  const validExts = ['.pdf', '.docx', '.csv', '.txt'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    showToast(`Invalid file type "${ext}". Supported: PDF, DOCX, CSV, TXT`, 'error');
    return;
  }

  dom.uploadStatus.classList.remove('d-none');
  dom.browseBtn.disabled = true;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('sessionId', STATE.activeSessionId);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'x-session-id': STATE.activeSessionId },
      body: formData,
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Upload error');
    }

    showToast(`"${data.filename}" indexed into ${data.chunkCount} chunks`, 'success');
    fetchDocuments();
    dom.stepDocs.classList.add('active');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    dom.uploadStatus.classList.add('d-none');
    dom.browseBtn.disabled = false;
  }
}

// Fetch Documents & Update UI
async function fetchDocuments() {
  try {
    const res = await fetch('/api/docs', {
      headers: { 'x-session-id': STATE.activeSessionId },
    });
    const data = await res.json();
    if (!data.success) return;

    const docs = data.documents || [];
    dom.docStatsLabel.innerText = `${docs.length} documents \u00B7 ${data.totalChunks || 0} chunks indexed`;
    dom.clearAllDocsBtn.style.display = docs.length > 0 ? 'inline-block' : 'none';

    dom.docsList.innerHTML = '';
    docs.forEach((doc) => {
      const card = document.createElement('div');
      card.className = 'doc-pill d-flex align-items-center justify-content-between mb-2 shadow-xs';
      card.innerHTML = `
        <div class="d-flex align-items-center gap-2 overflow-hidden me-2">
          <i class="bi bi-file-earmark-text text-success"></i>
          <span class="text-truncate fw-medium" title="${escapeHtml(doc.filename)}">${escapeHtml(doc.filename)}</span>
        </div>
        <button class="btn btn-link text-danger p-0 xx-small" title="Remove Document">&times;</button>
      `;
      card.querySelector('button').addEventListener('click', () => deleteDoc(doc.filename));
      dom.docsList.appendChild(card);
    });
  } catch (err) {
    console.warn('Failed to fetch documents:', err);
  }
}

async function deleteDoc(filename) {
  if (!confirm(`Delete "${filename}"?`)) return;
  try {
    const res = await fetch(`/api/docs/${encodeURIComponent(filename)}`, {
      method: 'DELETE',
      headers: { 'x-session-id': STATE.activeSessionId },
    });
    const data = await res.json();
    if (data.success) {
      fetchDocuments();
      showToast(`Removed "${filename}"`, 'info');
    }
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Submit Question
async function submitUserQuery() {
  if (STATE.isGenerating) return;

  const query = dom.queryInput.value.trim();
  if (!query) return;

  dom.queryInput.value = '';

  const session = getActiveSession();
  if (!session) return;

  // Name chat after first question if new
  if (session.messages.length === 0) {
    session.title = query.length > 28 ? query.slice(0, 28) + '...' : query;
    saveSessions();
    renderHistorySidebar();
  }

  // Append user message
  session.messages.push({ role: 'user', content: query });
  saveSessions();
  appendMessageToDOM('user', query);

  // Loading state
  STATE.isGenerating = true;
  dom.sendBtn.disabled = true;
  dom.typingIndicator.classList.remove('d-none');
  scrollToBottom();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': STATE.activeSessionId,
      },
      body: JSON.stringify({
        query,
        history: session.messages.slice(-6).map((m) => ({ role: m.role, content: m.content })),
        sessionId: STATE.activeSessionId,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      if (data.rateLimit) updateRateLimitDisplay(data.rateLimit);
      throw new Error(data.error || 'Failed to generate answer.');
    }

    if (data.rateLimit) {
      updateRateLimitDisplay(data.rateLimit);
    }

    const meta = { provider: data.provider, rateLimit: data.rateLimit };
    session.messages.push({
      role: 'assistant',
      content: data.answer,
      sources: data.sources || [],
      meta,
    });
    saveSessions();

    appendMessageToDOM('ai', data.answer, data.sources || [], meta);
  } catch (err) {
    appendMessageToDOM('ai', `❌ ${err.message}`);
    showToast(err.message, 'error');
  } finally {
    STATE.isGenerating = false;
    dom.sendBtn.disabled = false;
    dom.typingIndicator.classList.add('d-none');
    scrollToBottom();
  }
}

// Append Message to DOM
function appendMessageToDOM(role, content, sources = [], meta = {}) {
  dom.defaultWelcome.classList.add('d-none');
  dom.stepChat.classList.add('active');

  const row = document.createElement('div');

  if (role === 'user') {
    row.className = 'user-msg-row';
    row.innerHTML = `<div class="bubble-user shadow-sm">${escapeHtml(content)}</div>`;
  } else {
    row.className = 'ai-msg-row';
    const parsedMarkdown = renderMarkdown(content);
    let sourcesHtml = '';

    if (sources && sources.length > 0) {
      const accId = 'src-' + Math.random().toString(36).substring(2, 8);
      sourcesHtml = `
        <div class="mt-2 pt-2 border-top border-opacity-50">
          <a class="text-decoration-none xx-small fw-semibold text-secondary" data-bs-toggle="collapse" href="#${accId}">
            <i class="bi bi-quote"></i> Sources &amp; Citations (${sources.length}) &darr;
          </a>
          <div class="collapse mt-1" id="${accId}">
            <div class="d-flex flex-column gap-1">
              ${sources.map((s) => `
                <div class="p-2 rounded bg-body-tertiary border xx-small">
                  <span class="badge bg-success-subtle text-success me-1">${escapeHtml(s.file)} (p.${s.page})</span>
                  <span class="text-secondary fst-italic">${escapeHtml(s.snippet)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      `;
    }

    const providerTag = meta.provider ? `<span class="badge bg-body-secondary text-secondary me-auto xx-small">${escapeHtml(meta.provider)}</span>` : '';
    const qCountTag = meta.rateLimit ? `<span class="text-secondary xx-small me-2">Q${meta.rateLimit.used}/15</span>` : '';

    row.innerHTML = `
      <div class="bubble-ai shadow-sm">
        <div>${parsedMarkdown}</div>
        ${sourcesHtml}
        <div class="d-flex align-items-center justify-content-end mt-2 pt-1 border-top border-opacity-25">
          ${providerTag}
          ${qCountTag}
          <button class="btn btn-link text-secondary p-0 xx-small text-decoration-none copy-btn">
            <i class="bi bi-clipboard me-1"></i>Copy
          </button>
        </div>
      </div>
    `;

    const copyBtn = row.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content);
        copyBtn.innerHTML = '<i class="bi bi-check2 text-success me-1"></i>Copied!';
        setTimeout(() => {
          copyBtn.innerHTML = '<i class="bi bi-clipboard me-1"></i>Copy';
        }, 2000);
      });
    }
  }

  dom.chatMessages.appendChild(row);
  scrollToBottom();
}

function scrollToBottom() {
  dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

// API Health Check
async function checkApiStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.status === 'online') {
      const activeText = data.primary ? `${data.primary} active` : 'Local mode active';
      dom.modelStatusText.innerText = activeText;
    }
  } catch (err) {
    dom.modelStatusText.innerText = 'offline';
  }
}

// Rate limit fetch & update
async function fetchRateLimit() {
  try {
    const res = await fetch('/api/chat/limit', {
      headers: { 'x-session-id': STATE.activeSessionId },
    });
    const data = await res.json();
    if (data.rateLimit) {
      updateRateLimitDisplay(data.rateLimit);
    }
  } catch (err) {
    console.warn('Failed to fetch rate limit:', err);
  }
}

function updateRateLimitDisplay(info) {
  if (!info) return;
  const remaining = info.remaining ?? 15;
  const max = info.max ?? 15;

  dom.rateLimitBadge.innerHTML = `<i class="bi bi-chat-square-dots me-1"></i>${remaining}/${max} Qs Left`;

  if (remaining <= 0) {
    dom.rateLimitBadge.className = 'rate-badge bg-danger-subtle text-danger border-danger-subtle';
    dom.rateLimitFooter.innerHTML = `<span class="text-danger fw-bold">15/15 questions used (Clear/New chat to reset)</span>`;
    dom.sendBtn.disabled = true;
    dom.queryInput.placeholder = 'Session question limit reached. Click "+ New chat" on the left to reset.';
  } else {
    dom.rateLimitBadge.className = 'rate-badge';
    dom.rateLimitFooter.innerHTML = `${remaining}/${max} questions left in session`;
    dom.sendBtn.disabled = false;
    dom.queryInput.placeholder = 'Ask about your documents';
  }
}

function showToast(msg, type = 'info') {
  let icon = 'bi-info-circle text-primary';
  if (type === 'success') icon = 'bi-check-circle-fill text-success';
  if (type === 'error') icon = 'bi-exclamation-triangle-fill text-danger';

  dom.toastMessage.innerHTML = `<i class="bi ${icon} me-1"></i><span>${msg}</span>`;
  toastInstance.show();
}

function renderMarkdown(text) {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');
  html = html.replace(/^\s*[-*]\s+(.*)$/gim, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul class="ps-3 mb-2">$1</ul>');
  html = html.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>');
  return `<p class="mb-0">${html}</p>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
