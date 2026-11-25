/**
 * DocuMind - Claude-Style Editorial UI & Session Management
 * Cleaned for Free Version: Responsive Settings (Dark, Light, Neutral), Sound & Desktop Notifications
 */

const STORAGE_KEYS = {
  SESSIONS: 'documind_chat_sessions',
  ACTIVE_SESSION_ID: 'documind_active_session_id',
  THEME: 'documind_theme',
  NOTIFICATIONS: 'documind_notifications',
};

// Application State
const STATE = {
  sessions: loadStoredSessions(),
  activeSessionId: null,
  theme: localStorage.getItem(STORAGE_KEYS.THEME) || 'dark',
  notifications: loadNotificationsSettings(),
  isGenerating: false,
};

function loadNotificationsSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
    return raw ? JSON.parse(raw) : { sound: true, desktop: false, citations: true };
  } catch {
    return { sound: true, desktop: false, citations: true };
  }
}

function saveNotificationsSettings() {
  localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(STATE.notifications));
}

// DOM Elements
const dom = {
  html: document.documentElement,
  historySidebar: document.getElementById('historySidebar'),
  openSidebarBtn: document.getElementById('openSidebarBtn'),
  closeSidebarBtn: document.getElementById('closeSidebarBtn'),
  newChatBtn: document.getElementById('newChatBtn'),
  historyList: document.getElementById('historyList'),
  sessionCountBadge: document.getElementById('sessionCountBadge'),
  userProfileBtn: document.getElementById('userProfileBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  settingsModal: document.getElementById('settingsModal'),
  setThemeDarkBtn: document.getElementById('setThemeDarkBtn'),
  setThemeLightBtn: document.getElementById('setThemeLightBtn'),
  setThemeNeutralBtn: document.getElementById('setThemeNeutralBtn'),
  notifSoundToggle: document.getElementById('notifSoundToggle'),
  notifDesktopToggle: document.getElementById('notifDesktopToggle'),
  notifCitationsToggle: document.getElementById('notifCitationsToggle'),
  resetSessionBtn: document.getElementById('resetSessionBtn'),
  rateLimitFooter: document.getElementById('rateLimitFooter'),
  chatScrollArea: document.getElementById('chatScrollArea'),
  chatMessages: document.getElementById('chatMessages'),
  claudeHero: document.getElementById('claudeHero'),
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  browseBtn: document.getElementById('browseBtn'),
  inlineAttachBtn: document.getElementById('inlineAttachBtn'),
  uploadStatus: document.getElementById('uploadStatus'),
  uploadStatusText: document.getElementById('uploadStatusText'),
  typingIndicator: document.getElementById('typingIndicator'),
  chatForm: document.getElementById('chatForm'),
  queryInput: document.getElementById('queryInput'),
  sendBtn: document.getElementById('sendBtn'),
  liveToast: document.getElementById('liveToast'),
  toastMessage: document.getElementById('toastMessage'),
  chunksModal: document.getElementById('chunksModal'),
  chunksModalLabel: document.getElementById('chunksModalLabel'),
  chunksModalSubtitle: document.getElementById('chunksModalSubtitle'),
  chunksModalBody: document.getElementById('chunksModalBody'),
  chunksModalMeta: document.getElementById('chunksModalMeta'),
  userProfileAvatar: document.getElementById('userProfileAvatar'),
  userProfileName: document.getElementById('userProfileName'),
  userProfileEmail: document.getElementById('userProfileEmail'),
  accountModalAvatar: document.getElementById('accountModalAvatar'),
  accountModalName: document.getElementById('accountModalName'),
  accountModalEmail: document.getElementById('accountModalEmail'),
  accountModalStatus: document.getElementById('accountModalStatus'),
  accountSignOutBtn: document.getElementById('accountSignOutBtn'),
};

let toastInstance = null;
let chunksModalInstance = null;
let settingsModalInstance = null;

// Initialize on Load
document.addEventListener('DOMContentLoaded', () => {
  if (dom.liveToast) {
    toastInstance = new bootstrap.Toast(dom.liveToast, { delay: 4000 });
  }
  if (dom.chunksModal) {
    chunksModalInstance = new bootstrap.Modal(dom.chunksModal);
  }
  if (dom.settingsModal) {
    settingsModalInstance = new bootstrap.Modal(dom.settingsModal);
  }
  initTheme();
  initSessions();
  initEventListeners();
  checkAuthStatus();
  checkApiStatus();
  fetchRateLimit();
  fetchDocuments();
});

// Theme Management (Dark, Light, Neutral)
function initTheme() {
  applyTheme(STATE.theme);
}

function applyTheme(theme) {
  STATE.theme = theme;
  dom.html.setAttribute('data-bs-theme', theme);
  localStorage.setItem(STORAGE_KEYS.THEME, theme);

  // Update active state on appearance buttons
  if (dom.setThemeDarkBtn) dom.setThemeDarkBtn.classList.toggle('active', theme === 'dark');
  if (dom.setThemeLightBtn) dom.setThemeLightBtn.classList.toggle('active', theme === 'light');
  if (dom.setThemeNeutralBtn) dom.setThemeNeutralBtn.classList.toggle('active', theme === 'neutral');
}

// Audio Chime Synthesizer via Web Audio API (Zero external assets needed)
function playAnswerChime() {
  if (!STATE.notifications.sound) return;
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    // Gentle cheerful two-tone chime (F5 -> A5)
    osc.frequency.setValueAtTime(698.46, ctx.currentTime);
    osc.frequency.setValueAtTime(880.00, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.36);
  } catch (err) {
    console.debug('Audio chime skipped:', err);
  }
}

// Desktop Browser Notification
function triggerDesktopNotification(title, body) {
  if (!STATE.notifications.desktop) return;
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body.length > 120 ? body.substring(0, 117) + '...' : body,
        icon: 'images/logo.png',
      });
    } catch (e) {
      console.warn('Desktop notification error:', e);
    }
  }
}

// Session (Chat History) Management
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
  if (!dom.historyList) return;
  dom.historyList.innerHTML = '';

  if (dom.sessionCountBadge) {
    dom.sessionCountBadge.innerText = STATE.sessions.length > 0 ? `(${STATE.sessions.length})` : '';
  }

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
        <span class="history-dot"></span>
        <span class="history-title" title="${escapeHtml(s.title)}">${escapeHtml(s.title)}</span>
      </div>
      <button class="history-delete-btn" title="Delete chat">
        <i class="bi bi-trash3 xx-small"></i>
      </button>
    `;

    item.addEventListener('click', () => switchSession(s.id));
    const delBtn = item.querySelector('.history-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => deleteSession(s.id, e));
    }

    dom.historyList.appendChild(item);
  });
}

// Render Messages for Active Session
function renderCurrentSessionMessages() {
  if (!dom.chatMessages) return;

  // Clear existing rendered bubbles
  dom.chatMessages.querySelectorAll('.user-msg-row, .ai-msg-row, .doc-ingested-card').forEach((n) => n.remove());

  const session = getActiveSession();
  const messages = session ? session.messages : [];

  if (!messages || messages.length === 0) {
    if (dom.claudeHero) dom.claudeHero.classList.remove('d-none');
    return;
  }

  if (dom.claudeHero) dom.claudeHero.classList.add('d-none');

  messages.forEach((msg) => {
    if (msg.role === 'system_doc') {
      appendIngestionCardToDOM(msg.filename, msg.chunkCount, false);
    } else {
      appendMessageToDOM(msg.role, msg.content, msg.sources || [], msg.meta || {});
    }
  });

  scrollToBottom();
}

// Event Listeners
function initEventListeners() {
  // Sidebar Toggles
  const toggleSidebar = () => {
    if (dom.historySidebar) {
      dom.historySidebar.classList.toggle('collapsed');
    }
  };

  if (dom.openSidebarBtn) dom.openSidebarBtn.addEventListener('click', toggleSidebar);
  if (dom.closeSidebarBtn) {
    dom.closeSidebarBtn.addEventListener('click', () => {
      if (dom.historySidebar) dom.historySidebar.classList.add('collapsed');
    });
  }

  // Settings Trigger
  const openSettings = () => {
    if (settingsModalInstance) {
      settingsModalInstance.show();
    }
  };
  if (dom.settingsBtn) dom.settingsBtn.addEventListener('click', openSettings);
  if (dom.userProfileBtn) dom.userProfileBtn.addEventListener('click', openSettings);

  // Appearance Theme Selectors (Dark, Light, Neutral)
  if (dom.setThemeDarkBtn) {
    dom.setThemeDarkBtn.addEventListener('click', () => applyTheme('dark'));
  }
  if (dom.setThemeLightBtn) {
    dom.setThemeLightBtn.addEventListener('click', () => applyTheme('light'));
  }
  if (dom.setThemeNeutralBtn) {
    dom.setThemeNeutralBtn.addEventListener('click', () => applyTheme('neutral'));
  }

  // Notification Toggles
  if (dom.notifSoundToggle) {
    dom.notifSoundToggle.checked = STATE.notifications.sound !== false;
    dom.notifSoundToggle.addEventListener('change', (e) => {
      STATE.notifications.sound = e.target.checked;
      saveNotificationsSettings();
      if (e.target.checked) playAnswerChime();
    });
  }

  if (dom.notifDesktopToggle) {
    dom.notifDesktopToggle.checked = Boolean(STATE.notifications.desktop);
    dom.notifDesktopToggle.addEventListener('change', async (e) => {
      if (e.target.checked) {
        if ('Notification' in window) {
          const perm = await Notification.requestPermission();
          if (perm === 'granted') {
            STATE.notifications.desktop = true;
            showToast('Desktop notifications enabled', 'info');
          } else {
            e.target.checked = false;
            STATE.notifications.desktop = false;
            showToast('Permission denied by browser', 'error');
          }
        }
      } else {
        STATE.notifications.desktop = false;
      }
      saveNotificationsSettings();
    });
  }

  if (dom.notifCitationsToggle) {
    dom.notifCitationsToggle.checked = STATE.notifications.citations !== false;
    dom.notifCitationsToggle.addEventListener('change', (e) => {
      STATE.notifications.citations = e.target.checked;
      saveNotificationsSettings();
    });
  }

  // Reset Session Memory from Settings
  if (dom.resetSessionBtn) {
    dom.resetSessionBtn.addEventListener('click', async () => {
      if (!confirm('Clear session memory vector store?')) return;
      try {
        const res = await fetch('/api/docs', {
          method: 'DELETE',
          headers: { 'x-session-id': STATE.activeSessionId },
        });
        const data = await res.json();
        if (data.success) {
          showToast('Session memory cleared', 'info');
          fetchDocuments();
          fetchRateLimit();
          if (settingsModalInstance) settingsModalInstance.hide();
        }
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // Account Sign Out / In Button
  if (dom.accountSignOutBtn) {
    dom.accountSignOutBtn.addEventListener('click', async () => {
      const token = localStorage.getItem('documind_auth_token');
      if (token) {
        try {
          await fetch('/api/auth/signout', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
          });
        } catch (e) {
          console.warn('Signout error:', e);
        }
      }
      localStorage.removeItem('documind_auth_token');
      localStorage.removeItem('documind_user');
      window.location.href = '/signin';
    });
  }

  // New Chat
  if (dom.newChatBtn) {
    dom.newChatBtn.addEventListener('click', () => createNewChat(true));
  }

  // File Upload Dialog Triggers
  const openFilePicker = () => {
    if (dom.fileInput) dom.fileInput.click();
  };

  if (dom.browseBtn) dom.browseBtn.addEventListener('click', openFilePicker);
  if (dom.inlineAttachBtn) dom.inlineAttachBtn.addEventListener('click', openFilePicker);

  if (dom.dropZone) {
    dom.dropZone.addEventListener('click', (e) => {
      if (e.target !== dom.browseBtn) openFilePicker();
    });

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
  }

  // Window drag and drop
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  });

  if (dom.fileInput) {
    dom.fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
        dom.fileInput.value = '';
      }
    });
  }

  // Textarea Auto-Resize & Enter to send
  if (dom.queryInput) {
    dom.queryInput.addEventListener('input', () => {
      dom.queryInput.style.height = 'auto';
      dom.queryInput.style.height = Math.min(dom.queryInput.scrollHeight, 180) + 'px';
    });

    dom.queryInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        submitUserQuery();
      }
    });
  }

  // Form submit
  if (dom.chatForm) {
    dom.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      submitUserQuery();
    });
  }

  // Sample Query Chips
  document.querySelectorAll('.sample-query-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const q = btn.getAttribute('data-query');
      if (dom.queryInput) {
        dom.queryInput.value = q;
        submitUserQuery();
      }
    });
  });
}

// File Upload Handling
async function handleFileUpload(file) {
  if (!file) return;

  const validExts = ['.pdf', '.docx', '.csv', '.txt'];
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  if (!validExts.includes(ext)) {
    showToast(`Unsupported format "${ext}". Supported: PDF, DOCX, CSV, TXT`, 'error');
    return;
  }

  if (dom.uploadStatus) dom.uploadStatus.classList.remove('d-none');
  if (dom.uploadStatusText) dom.uploadStatusText.innerText = `Ingesting ${file.name}...`;

  const formData = new FormData();
  formData.append('file', file);

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

    // Append Ingestion Notice Card to Chat
    appendIngestionCardToDOM(data.filename, data.chunkCount, true);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (dom.uploadStatus) dom.uploadStatus.classList.add('d-none');
  }
}

// Fetch Active Documents
async function fetchDocuments() {
  try {
    const res = await fetch('/api/docs', {
      headers: { 'x-session-id': STATE.activeSessionId },
    });
    await res.json();
  } catch (err) {
    console.warn('Failed to fetch documents:', err);
  }
}

// Open Chunks Inspector Modal
async function openChunksModal(filename) {
  if (!dom.chunksModal || !chunksModalInstance) return;

  dom.chunksModalLabel.innerText = filename;
  dom.chunksModalSubtitle.innerText = 'Loading indexed chunks...';
  dom.chunksModalBody.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border spinner-border-sm text-terracotta mb-2" role="status"></div>
      <div class="text-secondary xx-small">Fetching vectorized chunks...</div>
    </div>
  `;
  dom.chunksModalMeta.innerText = '';

  chunksModalInstance.show();

  try {
    const res = await fetch(`/api/docs/${encodeURIComponent(filename)}/chunks`, {
      headers: { 'x-session-id': STATE.activeSessionId },
    });
    const data = await res.json();

    if (!data.success || !data.chunks || data.chunks.length === 0) {
      dom.chunksModalBody.innerHTML = `<div class="text-secondary text-center py-4">No chunks found for this document.</div>`;
      dom.chunksModalSubtitle.innerText = '0 chunks indexed';
      return;
    }

    dom.chunksModalSubtitle.innerText = `${data.totalChunks} vectorized chunks in memory`;
    dom.chunksModalMeta.innerText = `Source: ${filename} · Indexed with Keyless Local Embeddings (384-dim)`;

    const chunksHtml = data.chunks
      .map(
        (chunk) => `
      <div class="chunk-card">
        <div class="d-flex align-items-center justify-content-between mb-2">
          <span class="badge bg-dark-subtle text-terracotta fw-semibold xx-small">
            Chunk #${chunk.index}
          </span>
          <span class="text-secondary xx-small">
            ${chunk.wordCount} words &middot; ${chunk.content.length} chars
          </span>
        </div>
        <div class="chunk-content-text">${escapeHtml(chunk.content)}</div>
      </div>
    `
      )
      .join('');

    dom.chunksModalBody.innerHTML = chunksHtml;
  } catch (err) {
    dom.chunksModalBody.innerHTML = `<div class="text-danger py-3">Failed to load chunks: ${escapeHtml(err.message)}</div>`;
  }
}

// Append Ingestion Notice Card to Chat
function appendIngestionCardToDOM(filename, chunkCount, saveToSession = true) {
  if (!dom.chatMessages) return;

  if (dom.claudeHero) dom.claudeHero.classList.add('d-none');

  const card = document.createElement('div');
  card.className = 'doc-ingested-card';
  card.innerHTML = `
    <div class="d-flex align-items-center justify-content-between">
      <div class="d-flex align-items-center gap-2">
        <i class="bi bi-file-earmark-check text-terracotta fs-5"></i>
        <div>
          <div class="fw-semibold text-light small">${escapeHtml(filename)}</div>
          <div class="text-secondary xx-small">${chunkCount} chunks indexed &middot; Vectorized locally &middot; Ready to query</div>
        </div>
      </div>
      <button class="btn btn-icon-ghost btn-sm inspect-in-chat-btn" title="Inspect indexed chunks">
        <i class="bi bi-eye"></i> View Chunks
      </button>
    </div>
    <div class="d-flex gap-2 flex-wrap pt-2 border-top border-dark-subtle">
      <button class="btn btn-claude-chip btn-sm sample-doc-query" data-query="Summarize ${escapeHtml(filename)}">
        Summarize
      </button>
      <button class="btn btn-claude-chip btn-sm sample-doc-query" data-query="What are the key points and qualifications in ${escapeHtml(filename)}?">
        Key Points
      </button>
      <button class="btn btn-claude-chip btn-sm sample-doc-query" data-query="Extract details, dates, and names from ${escapeHtml(filename)}">
        Details &amp; Dates
      </button>
    </div>
  `;

  card.querySelector('.inspect-in-chat-btn').addEventListener('click', () => openChunksModal(filename));

  card.querySelectorAll('.sample-doc-query').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (dom.queryInput) {
        dom.queryInput.value = btn.getAttribute('data-query');
        submitUserQuery();
      }
    });
  });

  dom.chatMessages.appendChild(card);
  scrollToBottom();

  if (saveToSession) {
    const session = getActiveSession();
    if (session) {
      session.messages.push({
        role: 'system_doc',
        filename,
        chunkCount,
        timestamp: new Date().toISOString(),
      });
      saveSessions();
    }
  }
}

// Submit User Query
async function submitUserQuery() {
  if (STATE.isGenerating) return;

  const query = (dom.queryInput ? dom.queryInput.value : '').trim();
  if (!query) {
    showToast('Please enter a question before sending.', 'error');
    if (dom.queryInput) dom.queryInput.focus();
    return;
  }

  // Auto-generate session title if first message
  const session = getActiveSession();
  if (session && session.messages.filter((m) => m.role !== 'system_doc').length === 0) {
    session.title = query.length > 34 ? query.substring(0, 34) + '...' : query;
    saveSessions();
    renderHistorySidebar();
  }

  // Reset textarea
  if (dom.queryInput) {
    dom.queryInput.value = '';
    dom.queryInput.style.height = 'auto';
  }

  // Hide empty state hero
  if (dom.claudeHero) dom.claudeHero.classList.add('d-none');

  // Append user message
  appendMessageToDOM('user', query);
  if (session) {
    session.messages.push({ role: 'user', content: query, timestamp: new Date().toISOString() });
    saveSessions();
  }

  // Show Typing Indicator
  STATE.isGenerating = true;
  if (dom.sendBtn) dom.sendBtn.disabled = true;
  if (dom.typingIndicator) dom.typingIndicator.classList.remove('d-none');
  scrollToBottom();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': STATE.activeSessionId,
      },
      body: JSON.stringify({ query, question: query }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Server error');
    }

    const answer = data.answer || 'No answer returned.';
    const sources = data.sources || [];
    const meta = {
      provider: data.provider || 'Groq',
      model: data.model || 'openai/gpt-oss-120b',
      questionNumber: data.questionNumber || 1,
      totalAllowed: data.totalAllowed || 15,
      cached: data.cached || false,
    };

    appendMessageToDOM('assistant', answer, sources, meta);

    if (session) {
      session.messages.push({
        role: 'assistant',
        content: answer,
        sources,
        meta,
        timestamp: new Date().toISOString(),
      });
      saveSessions();
    }

    // Play notification sound & trigger desktop alert if enabled
    playAnswerChime();
    triggerDesktopNotification('DocuMind - Answer Fetched', answer);

    fetchRateLimit();
  } catch (err) {
    const errorMsg = `Error: ${err.message}`;
    appendMessageToDOM('assistant', errorMsg, [], { provider: 'Error' });
    showToast(err.message, 'error');
  } finally {
    STATE.isGenerating = false;
    if (dom.sendBtn) dom.sendBtn.disabled = false;
    if (dom.typingIndicator) dom.typingIndicator.classList.add('d-none');
    scrollToBottom();
  }
}

// Append Message to DOM
function appendMessageToDOM(role, content, sources = [], meta = {}) {
  if (!dom.chatMessages) return;

  if (role === 'user') {
    const row = document.createElement('div');
    row.className = 'user-msg-row';
    row.innerHTML = `<div class="claude-bubble-user">${escapeHtml(content)}</div>`;
    dom.chatMessages.appendChild(row);
  } else {
    const row = document.createElement('div');
    row.className = 'ai-msg-row';

    const providerClass = (meta.provider || '').toLowerCase().includes('groq')
      ? 'groq'
      : (meta.provider || '').toLowerCase().includes('gemini')
      ? 'gemini'
      : '';

    const hasSources = Boolean(STATE.notifications.citations) && sources && sources.length > 0;
    const accordionId = 'src-' + Math.random().toString(36).substring(2, 9);

    let sourcesHtml = '';
    if (hasSources) {
      const chunkItems = sources
        .map(
          (s, idx) => `
        <div class="source-chunk-card">
          <div class="d-flex align-items-center justify-content-between mb-1">
            <span class="fw-semibold text-terracotta xx-small">[${idx + 1}] ${escapeHtml(s.source || 'Document')} (Chunk ${s.chunkIndex ?? idx})</span>
            ${s.score ? `<span class="badge bg-dark-subtle text-secondary xx-small">Score: ${s.score.toFixed(3)}</span>` : ''}
          </div>
          <div class="text-secondary small font-monospace" style="font-size: 0.8rem; line-height: 1.4;">
            ${escapeHtml(s.content ? s.content.substring(0, 320) + (s.content.length > 320 ? '...' : '') : '')}
          </div>
        </div>`
        )
        .join('');

      sourcesHtml = `
        <div class="mt-2">
          <button class="sources-toggle-btn" type="button" data-bs-toggle="collapse" data-bs-target="#${accordionId}">
            <i class="bi bi-quote"></i> Sources &amp; Citations (${sources.length})
            <i class="bi bi-chevron-down xx-small"></i>
          </button>
          <div class="collapse mt-1" id="${accordionId}">
            <div class="sources-drawer">
              ${chunkItems}
            </div>
          </div>
        </div>
      `;
    }

    const formattedContent = formatMarkdown(content);

    row.innerHTML = `
      <div class="claude-bubble-ai">
        <div class="message-body">${formattedContent}</div>
        ${sourcesHtml}
        <div class="ai-meta-bar">
          <div class="d-flex align-items-center gap-2">
            <span class="provider-badge ${providerClass}">${escapeHtml(meta.provider || 'DocuMind')}</span>
            ${meta.cached ? '<span class="badge bg-secondary-subtle text-secondary xx-small">Cached</span>' : ''}
          </div>
          <div class="d-flex align-items-center gap-3 xx-small text-secondary">
            ${meta.questionNumber ? `<span>Q${meta.questionNumber}/${meta.totalAllowed || 15}</span>` : ''}
            <button class="btn btn-icon-ghost btn-sm copy-btn p-0" title="Copy answer">
              <i class="bi bi-clipboard"></i> Copy
            </button>
          </div>
        </div>
      </div>
    `;

    // Copy to clipboard
    const copyBtn = row.querySelector('.copy-btn');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(content).then(() => {
          copyBtn.innerHTML = '<i class="bi bi-check2 text-success"></i> Copied';
          setTimeout(() => {
            copyBtn.innerHTML = '<i class="bi bi-clipboard"></i> Copy';
          }, 2000);
        });
      });
    }

    dom.chatMessages.appendChild(row);
  }
}

// Fetch Rate Limit & Providers
async function fetchRateLimit() {
  try {
    const res = await fetch('/api/chat/limit', {
      headers: { 'x-session-id': STATE.activeSessionId },
    });
    const data = await res.json();
    if (!data.success) return;

    const remaining = data.remainingQuestions ?? 15;
    const total = data.totalAllowed ?? 15;

    if (dom.rateLimitFooter) dom.rateLimitFooter.innerText = `${remaining}/${total} left`;
  } catch (err) {
    console.warn('Rate limit fetch failed:', err);
  }
}

async function checkApiStatus() {
  try {
    const res = await fetch('/api/status');
    await res.json();
  } catch (err) {
    console.warn('API health check error:', err);
  }
}

// User Authentication State & UI Sync
async function checkAuthStatus() {
  const token = localStorage.getItem('documind_auth_token');
  const cachedUserRaw = localStorage.getItem('documind_user');
  let cachedUser = null;
  try {
    cachedUser = cachedUserRaw ? JSON.parse(cachedUserRaw) : null;
  } catch {}

  if (!token) {
    if (cachedUser) {
      updateUserUI(cachedUser, false);
    } else {
      updateUserUI({ name: 'Kashif', email: 'kashif@documind.ai' }, false);
    }
    return;
  }

  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.authenticated && data.user) {
      localStorage.setItem('documind_user', JSON.stringify(data.user));
      updateUserUI(data.user, true);
    } else {
      localStorage.removeItem('documind_auth_token');
      updateUserUI({ name: 'Kashif', email: 'kashif@documind.ai' }, false);
    }
  } catch (err) {
    console.warn('Auth check error:', err);
    if (cachedUser) updateUserUI(cachedUser, true);
  }
}

function updateUserUI(user, isLoggedIn) {
  const name = user.name || 'Kashif';
  const email = user.email || 'kashif@documind.ai';
  const initial = name.charAt(0).toUpperCase() || 'K';

  if (dom.userProfileAvatar) dom.userProfileAvatar.innerText = initial;
  if (dom.userProfileName) dom.userProfileName.innerText = name;
  if (dom.userProfileEmail) dom.userProfileEmail.innerText = email;

  if (dom.accountModalAvatar) dom.accountModalAvatar.innerText = initial;
  if (dom.accountModalName) dom.accountModalName.innerText = name;
  if (dom.accountModalEmail) dom.accountModalEmail.innerText = email;

  if (dom.accountModalStatus) {
    dom.accountModalStatus.innerText = isLoggedIn ? 'Active Account' : 'Guest Mode';
    dom.accountModalStatus.className = `badge ${isLoggedIn ? 'bg-brand' : 'bg-secondary'} mt-1`;
  }

  if (dom.accountSignOutBtn) {
    if (isLoggedIn) {
      dom.accountSignOutBtn.innerHTML = '<i class="bi bi-box-arrow-right me-1"></i> Sign Out';
      dom.accountSignOutBtn.className = 'btn btn-outline-danger btn-sm px-3';
    } else {
      dom.accountSignOutBtn.innerHTML = '<i class="bi bi-box-arrow-in-right me-1"></i> Sign In';
      dom.accountSignOutBtn.className = 'btn btn-claude-primary btn-sm px-3';
    }
  }
}

// Helpers
function scrollToBottom() {
  const container = dom.chatScrollArea || dom.chatMessages;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}

function showToast(message, type = 'info') {
  if (!dom.toastMessage || !toastInstance) return;
  dom.toastMessage.innerHTML = `
    <i class="bi ${type === 'error' ? 'bi-exclamation-triangle-fill text-danger' : 'bi-check-circle-fill text-success'}"></i>
    <span>${escapeHtml(message)}</span>
  `;
  toastInstance.show();
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

function formatMarkdown(text) {
  if (!text) return '';
  let escaped = escapeHtml(text);

  // Bold **text**
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic *text*
  escaped = escaped.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Code `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code class="bg-dark-subtle px-1 rounded text-light">$1</code>');
  // Paragraphs / Newlines
  escaped = escaped.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>');

  return `<p>${escaped}</p>`;
}
