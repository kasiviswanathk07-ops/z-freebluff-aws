'use strict';
/**
 * Campus Placement & Internship Portal — server entry point.
 *
 * Serves the multi-page HTML/CSS/JS frontend from /public and a role-guarded
 * JSON API from /api. Run with `npm start` (or `npm run seed` to reset data).
 */
const path = require('path');
const express = require('express');

const store = require('./db');
const auth = require('./auth');
const meta = require('./eligibility');

const PORT = Number(process.env.PORT) || 3000;

/* Auto-seed on first run so `npm start` always gives a working demo. */
if (!store.dbExists()) {
  console.log('No data/db.json found — seeding demo data...');
  require('./seed').seed({ quiet: true });
}

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(auth.attachUser);

/* ------------------------------- API ------------------------------- */
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString(), db: store.DB_FILE });
});

app.get('/api/meta', (req, res) => {
  res.json({
    branches: meta.BRANCHES,
    jobTypes: meta.JOB_TYPES,
    workModes: meta.WORK_MODES,
    applicationStatuses: meta.APPLICATION_STATUSES,
    recruiterTransitions: meta.RECRUITER_TRANSITIONS,
    companyStatuses: meta.COMPANY_STATUSES,
    jobStatuses: meta.JOB_STATUSES
  });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/student', require('./routes/student'));
app.use('/api/recruiter', require('./routes/recruiter'));
app.use('/api/admin', require('./routes/admin'));

app.use('/api', (req, res) => res.status(404).json({ error: `Unknown API endpoint: ${req.method} ${req.originalUrl}` }));

/* ---------------------------- static site ---------------------------- */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

/* ----------------------------- fallbacks ----------------------------- */
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[server error]', err);
  res.status(status).json({ error: err.message || 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log('\n  Campus Placement & Internship Portal');
  console.log(`  → http://localhost:${PORT}\n`);
  console.log('  Demo logins (password in brackets):');
  console.log('    Student    aarav@student.campus.edu   [student123]');
  console.log('    Recruiter  priya@technova.io          [recruiter123]');
  console.log('    Admin      admin@campus.edu           [admin123]');
  console.log('\n  Data file: data/db.json  (reset with `npm run seed`)\n');
});

module.exports = app;
