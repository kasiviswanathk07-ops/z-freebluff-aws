'use strict';
/**
 * Tiny file-backed JSON database.
 *
 * Keeps the project dependency-light and makes the "database" transparent:
 * data/db.json can be inspected, diffed, versioned or reset with one command.
 * All writes are synchronous single-process writes, which is perfectly fine for
 * a campus-scale demo portal.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let state = null;
let loadedMtimeMs = 0;

const COLLECTIONS = ['users', 'companies', 'jobs', 'applications', 'logs', 'sessions'];

function emptyState() {
  return {
    meta: { version: 1, createdAt: new Date().toISOString(), counters: {} },
    users: [],
    companies: [],
    jobs: [],
    applications: [],
    logs: [],
    sessions: []
  };
}

function normalize(s) {
  for (const key of COLLECTIONS) {
    if (!Array.isArray(s[key])) s[key] = [];
  }
  if (!s.meta || typeof s.meta !== 'object') s.meta = { version: 1, counters: {} };
  if (!s.meta.counters) s.meta.counters = {};
  return s;
}

function fileMtime() {
  try {
    return fs.statSync(DB_FILE).mtimeMs;
  } catch {
    return 0;
  }
}

function ensureLoaded() {
  if (!fs.existsSync(DB_FILE)) {
    if (!state) {
      state = normalize(emptyState());
      save();
    }
    return state;
  }
  /* Reload when the file changed on disk (e.g. `npm run seed` while the server
     is running) so the two never drift apart. */
  const mtime = fileMtime();
  if (!state || mtime > loadedMtimeMs + 1) {
    try {
      state = normalize(JSON.parse(fs.readFileSync(DB_FILE, 'utf8')));
      loadedMtimeMs = mtime;
    } catch (err) {
      if (!state) throw new Error('data/db.json is not valid JSON — delete it or run `npm run seed`: ' + err.message);
      console.error('[db] ignoring unreadable db.json, keeping in-memory state:', err.message);
    }
  }
  return state;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, DB_FILE);
  loadedMtimeMs = fileMtime();
}

function db() {
  return ensureLoaded();
}

function nextId(prefix) {
  const s = db();
  s.meta.counters[prefix] = (s.meta.counters[prefix] || 0) + 1;
  return `${prefix}_${String(s.meta.counters[prefix]).padStart(4, '0')}`;
}

function dbExists() {
  return fs.existsSync(DB_FILE);
}

/** Replace the whole state (used by the seed script). */
function reset(newState) {
  state = newState || emptyState();
  save();
  return state;
}

/* ---------------- convenience lookups ---------------- */

const findUser = (id) => db().users.find((u) => u.id === id) || null;
const findUserByEmail = (email) =>
  db().users.find((u) => u.email.toLowerCase() === String(email || '').trim().toLowerCase()) || null;
const findCompany = (id) => db().companies.find((c) => c.id === id) || null;
const findCompanyByOwner = (ownerId) => db().companies.find((c) => c.ownerId === ownerId) || null;
const findJob = (id) => db().jobs.find((j) => j.id === id) || null;
const findApplication = (id) => db().applications.find((a) => a.id === id) || null;

/**
 * Append an immutable audit record. Used for every admin decision and every
 * recruiter status transition so the placement cell has a full trail.
 */
function addLog({ action, entityType, entityId, entityLabel, actor, reason, meta, timestamp }) {
  const entry = {
    id: nextId('log'),
    action,
    entityType: entityType || null,
    entityId: entityId || null,
    entityLabel: entityLabel || null,
    actorId: actor ? actor.id : 'system',
    actorName: actor ? actor.name : 'system',
    actorRole: actor ? actor.role : 'system',
    reason: reason || null,
    meta: meta || null,
    timestamp: timestamp || new Date().toISOString()
  };
  db().logs.unshift(entry);
  save();
  return entry;
}

module.exports = {
  DB_FILE,
  dbExists,
  db,
  save,
  reset,
  nextId,
  findUser,
  findUserByEmail,
  findCompany,
  findCompanyByOwner,
  findJob,
  findApplication,
  addLog
};
