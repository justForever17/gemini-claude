/**
 * Authentication Module
 * Handles password hashing, session management, and authentication middleware
 * 
 * Security considerations:
 * - Passwords are hashed using bcrypt with cost factor 10
 * - Sessions expire after 1 hour
 * - Session tokens are cryptographically secure random values
 * - All sessions are cleared on password change
 */

const bcrypt = require('bcrypt');
const crypto = require('crypto');

const SALT_ROUNDS = 10;
const SESSION_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

// In-memory session store (Map: token -> session object)
const sessions = new Map();

// Hash password using bcrypt
async function hashPassword(password) {
  return await bcrypt.hash(password, SALT_ROUNDS);
}

// Verify password against hash
async function verifyPassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

// Generate secure session token
function generateSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Create new session
function createSession() {
  const token = generateSessionToken();
  const now = Date.now();
  sessions.set(token, {
    token,
    createdAt: now,
    expiresAt: now + SESSION_DURATION
  });
  return token;
}

// Validate session token
function validateSession(token) {
  const session = sessions.get(token);
  if (!session) return false;
  
  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return false;
  }
  
  return true;
}

// Clear session
function clearSession(token) {
  sessions.delete(token);
}

// Clear all sessions (e.g., on password change)
function clearAllSessions() {
  sessions.clear();
}

// Middleware to validate session
function requireSession(req, res, next) {
  const token = req.headers['x-session-token'];
  
  if (!token || !validateSession(token)) {
    return res.status(401).json({
      error: {
        type: 'authentication_error',
        message: 'Invalid or expired session'
      }
    });
  }
  
  req.sessionToken = token;
  next();
}

// Middleware to validate API key
function requireApiKey(config) {
  return (req, res, next) => {
    const auth = req.headers['authorization'];
    if (!auth) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Missing API key'
        }
      });
    }
    
    const apiKey = auth.replace('Bearer ', '');
    if (apiKey !== config.localApiKey) {
      return res.status(401).json({
        error: {
          type: 'authentication_error',
          message: 'Invalid API key'
        }
      });
    }
    
    next();
  };
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  validateSession,
  clearSession,
  clearAllSessions,
  requireSession,
  requireApiKey
};
