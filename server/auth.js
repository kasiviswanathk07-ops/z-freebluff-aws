'use strict';
/** Password hashing (bcryptjs) + cookie sessions persisted in the JSON db. */
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const store = require('./db');

const SESSION_COOKIE = 'pp_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/* ---------------- passwords ---------------- */

function hashPassword(password) {
  return bcrypt.hashSync(String(password), 10);
}

function verifyPassword(password, hash) {
  if (!hash) return false;
  try {
    return bcrypt.compareSync(String(password), hash);
  } catch {
    return false;
  }
}

/* ---------------- sessions ---------------- */

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  store.db().sessions.push({
    token,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  });
  // opportunistic cleanup of expired sessions
  store.db().sessions = store.db().sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
  store.save();
  return token;
}

function destroySession(token) {
  const sessions = store.db().sessions;
  const idx = sessions.findIndex((s) => s.token === token);
  if (idx !== -1) {
    sessions.splice(idx, 1);
    store.save();
  }
}

function userFromToken(token) {
  if (!token) return null;
  const session = store.db().sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) {
    destroySession(token);
    return null;
  }
  const user = store.findUser(session.userId);
  if (!user || user.status === 'disabled') return null;
  return user;
}

/* ---------------- cookies ---------------- */

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  }
  return out;
}

function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

/* ---------------- express middleware ---------------- */

/** Populates req.user (or null) from the session cookie. */
function attachUser(req, res, next) {
  const token = parseCookies(req)[SESSION_COOKIE] || null;
  req.sessionToken = token;
  req.user = userFromToken(token);
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Not signed in. Please log in to continue.' });
  }
  next();
}

/** Server-side permission boundary: only the listed roles may proceed. */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not signed in. Please log in to continue.' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied — this area is restricted to: ${roles.join(', ')}.` });
    }
    next();
  };
}

function publicUser(user) {
  if (!user) return null;
  const { passwordHash, ...rest } = user;
  return rest;
}

module.exports = {
  SESSION_COOKIE,
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  userFromToken,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  attachUser,
  requireAuth,
  requireRole,
  publicUser
};
