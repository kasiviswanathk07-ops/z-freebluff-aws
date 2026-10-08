'use strict';
/** Auth routes: register (student/recruiter), login, logout, session info. */
const express = require('express');
const store = require('../db');
const auth = require('../auth');
const { BRANCHES } = require('../eligibility');

const router = express.Router();

const str = (v) => (v == null ? '' : String(v).trim());

/* ---------------------------- register ---------------------------- */
router.post('/register', (req, res) => {
  const body = req.body || {};
  const role = body.role;
  if (!['student', 'recruiter'].includes(role)) {
    return res.status(400).json({ error: 'Role must be either "student" or "recruiter".' });
  }

  const name = str(body.name);
  const email = str(body.email).toLowerCase();
  const password = String(body.password || '');
  if (!name) return res.status(400).json({ error: 'Full name is required.' });
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'A valid email address is required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (store.findUserByEmail(email)) return res.status(409).json({ error: 'An account with this email already exists.' });

  const now = new Date().toISOString();
  const user = {
    id: store.nextId('usr'),
    role,
    name,
    email,
    passwordHash: auth.hashPassword(password),
    status: 'active',
    createdAt: now
  };

  let company = null;

  if (role === 'student') {
    const cgpa = body.cgpa == null || body.cgpa === '' ? null : Number(body.cgpa);
    const gradYear = body.graduationYear == null || body.graduationYear === '' ? null : Number(body.graduationYear);
    if (cgpa != null && (Number.isNaN(cgpa) || cgpa < 0 || cgpa > 10)) {
      return res.status(400).json({ error: 'CGPA must be a number between 0 and 10.' });
    }
    if (gradYear != null && (Number.isNaN(gradYear) || gradYear < 2020 || gradYear > 2035)) {
      return res.status(400).json({ error: 'Graduation year looks invalid.' });
    }
    if (body.branch && !BRANCHES.includes(body.branch)) {
      return res.status(400).json({ error: `Unknown department. Valid: ${BRANCHES.join(', ')}.` });
    }
    user.student = {
      rollNo: str(body.rollNo),
      branch: body.branch || '',
      cgpa,
      graduationYear: gradYear,
      backlogs: body.backlogs == null || body.backlogs === '' ? null : Number(body.backlogs),
      phone: str(body.phone),
      resumeUrl: str(body.resumeUrl),
      skills: Array.isArray(body.skills) ? body.skills.map(str).filter(Boolean) : [],
      about: str(body.about),
      updatedAt: now
    };
  } else {
    const companyName = str(body.companyName);
    if (!companyName) return res.status(400).json({ error: 'Company name is required for recruiter accounts.' });
    company = {
      id: store.nextId('cmp'),
      ownerId: user.id,
      name: companyName,
      website: str(body.website),
      industry: str(body.industry),
      location: str(body.location),
      size: str(body.size),
      about: str(body.companyAbout),
      hrName: name,
      hrEmail: email,
      hrPhone: str(body.hrPhone),
      status: 'pending', // every new company starts in the admin review queue
      decision: null,
      createdAt: now,
      updatedAt: now
    };
    store.db().companies.push(company);
    store.addLog({
      action: 'company.registered',
      entityType: 'company',
      entityId: company.id,
      entityLabel: company.name,
      actor: user,
      reason: 'New company self-registered through the portal; awaiting placement cell review.'
    });
  }

  store.db().users.push(user);
  store.save();

  const token = auth.createSession(user.id);
  auth.setSessionCookie(res, token);
  res.status(201).json({
    user: auth.publicUser(user),
    company: company ? { id: company.id, name: company.name, status: company.status } : null
  });
});

/* ------------------------------ login ------------------------------ */
router.post('/login', (req, res) => {
  const body = req.body || {};
  const email = str(body.email).toLowerCase();
  const password = String(body.password || '');
  const user = store.findUserByEmail(email);
  if (!user || !auth.verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }
  if (user.status === 'disabled') {
    return res.status(403).json({ error: 'This account has been disabled. Contact the placement cell.' });
  }
  const token = auth.createSession(user.id);
  auth.setSessionCookie(res, token);

  let company = null;
  if (user.role === 'recruiter') {
    const c = store.findCompanyByOwner(user.id);
    if (c) company = { id: c.id, name: c.name, status: c.status };
  }
  res.json({ user: auth.publicUser(user), company });
});

/* ------------------------------ logout ------------------------------ */
router.post('/logout', (req, res) => {
  if (req.sessionToken) auth.destroySession(req.sessionToken);
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

/* ------------------------------- me ------------------------------- */
router.get('/me', auth.requireAuth, (req, res) => {
  let company = null;
  if (req.user.role === 'recruiter') {
    const c = store.findCompanyByOwner(req.user.id);
    if (c) company = { id: c.id, name: c.name, status: c.status };
  }
  res.json({ user: auth.publicUser(req.user), company });
});

module.exports = router;
