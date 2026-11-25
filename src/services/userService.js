import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.join(__dirname, '../../data/users.json');

// In-memory cache + persistent JSON storage
let users = [];
let sessions = new Map(); // token -> { userId, expiresAt }

// Load from disk
function loadUsers() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      users = JSON.parse(raw);
    } else {
      users = [];
      saveUsers();
    }
  } catch (err) {
    console.error('[UserService] Error loading users:', err);
    users = [];
  }

  // Pre-seed default user if no users exist
  if (users.length === 0) {
    seedDefaultUser();
  }
}

// Save to disk atomically
function saveUsers() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.error('[UserService] Error saving users:', err);
  }
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function seedDefaultUser() {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword('Password123!', salt);
  const defaultUser = {
    id: 'user-' + crypto.randomUUID(),
    name: 'Kashif',
    email: 'kashif@documind.ai',
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };
  users.push(defaultUser);
  saveUsers();
  console.log('[UserService] Initialized default user: kashif@documind.ai (Password: Password123!)');
}

// Email & password validation
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
}

export function isValidPassword(password) {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6;
}

// Initialize on import
loadUsers();

/**
 * Register a new user
 */
export function registerUser({ name, email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanName = (name || '').trim();

  if (!cleanName) {
    return { success: false, error: 'Full name is required.' };
  }

  if (!isValidEmail(cleanEmail)) {
    return { success: false, error: 'Please enter a valid email address (e.g., name@example.com).' };
  }

  if (!isValidPassword(password)) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  // Check existing user
  const existing = users.find((u) => u.email === cleanEmail);
  if (existing) {
    return { success: false, error: 'An account with this email address already exists. Please sign in.' };
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = hashPassword(password, salt);

  const newUser = {
    id: 'user-' + crypto.randomUUID(),
    name: cleanName,
    email: cleanEmail,
    salt,
    hash,
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  saveUsers();

  // Create session
  const token = createSession(newUser.id);

  return {
    success: true,
    user: { id: newUser.id, name: newUser.name, email: newUser.email },
    token,
  };
}

/**
 * Authenticate existing user
 */
export function authenticateUser({ email, password }) {
  const cleanEmail = (email || '').trim().toLowerCase();

  if (!isValidEmail(cleanEmail)) {
    return { success: false, error: 'Please enter a valid email address.' };
  }

  if (!password) {
    return { success: false, error: 'Password is required.' };
  }

  const user = users.find((u) => u.email === cleanEmail);
  if (!user) {
    return { success: false, error: 'Invalid email or password.' };
  }

  const inputHash = hashPassword(password, user.salt);
  const hashBuf = Buffer.from(user.hash, 'hex');
  const inputBuf = Buffer.from(inputHash, 'hex');

  if (hashBuf.length !== inputBuf.length || !crypto.timingSafeEqual(hashBuf, inputBuf)) {
    return { success: false, error: 'Invalid email or password.' };
  }

  const token = createSession(user.id);

  return {
    success: true,
    user: { id: user.id, name: user.name, email: user.email },
    token,
  };
}

/**
 * Session management
 */
function createSession(userId) {
  const token = 'dcm_' + crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  sessions.set(token, { userId, expiresAt });
  return token;
}

export function getUserByToken(token) {
  if (!token) return null;
  const sess = sessions.get(token);
  if (!sess) return null;

  if (Date.now() > sess.expiresAt) {
    sessions.delete(token);
    return null;
  }

  const user = users.find((u) => u.id === sess.userId);
  if (!user) return null;

  return { id: user.id, name: user.name, email: user.email };
}

export function destroySession(token) {
  if (token) {
    sessions.delete(token);
  }
  return true;
}
