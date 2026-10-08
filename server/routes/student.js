'use strict';
/** Student routes: profile, job browsing with live eligibility, applications & tracking. */
const express = require('express');
const store = require('../db');
const auth = require('../auth');
const { evaluateEligibility, BRANCHES } = require('../eligibility');

const router = express.Router();
router.use(auth.requireRole('student'));

const nowIso = () => new Date().toISOString();
const isHttpUrl = (v) => /^https?:\/\/\S+$/i.test(String(v || ''));

function ownApplication(userId, jobId) {
  return store.db().applications.find((a) => a.studentId === userId && a.jobId === jobId) || null;
}

function jobWithCompany(job) {
  const company = store.findCompany(job.companyId);
  return {
    ...job,
    companyName: company ? company.name : 'Unknown company',
    companyLocation: company ? company.location : '',
    companyIndustry: company ? company.industry : ''
  };
}

function applicationWithJoin(app) {
  const job = store.findJob(app.jobId);
  const company = job ? store.findCompany(job.companyId) : null;
  const student = store.findUser(app.studentId);
  return {
    ...app,
    job: job
      ? {
          id: job.id,
          title: job.title,
          type: job.type,
          location: job.location,
          workMode: job.workMode,
          deadline: job.deadline,
          companyName: company ? company.name : 'Unknown company'
        }
      : null,
    student: student
      ? {
          id: student.id,
          name: student.name,
          email: student.email,
          rollNo: student.student && student.student.rollNo,
          branch: student.student && student.student.branch,
          cgpa: student.student && student.student.cgpa,
          graduationYear: student.student && student.student.graduationYear,
          resumeUrl: student.student && student.student.resumeUrl,
          phone: student.student && student.student.phone,
          skills: (student.student && student.student.skills) || [],
          about: student.student && student.student.about
        }
      : null
  };
}

/* ------------------------------ profile ------------------------------ */
router.get('/profile', (req, res) => {
  res.json({ profile: req.user.student || null, user: auth.publicUser(req.user) });
});

router.put('/profile', (req, res) => {
  const body = req.body || {};
  const errors = [];
  const current = req.user.student || {};

  const branch = body.branch !== undefined ? String(body.branch).trim() : current.branch;
  if (branch && !BRANCHES.includes(branch)) errors.push(`Unknown department. Valid: ${BRANCHES.join(', ')}.`);

  const cgpa = body.cgpa !== undefined && body.cgpa !== '' ? Number(body.cgpa) : current.cgpa ?? null;
  if (cgpa != null && (Number.isNaN(cgpa) || cgpa < 0 || cgpa > 10)) errors.push('CGPA must be a number between 0 and 10.');

  const graduationYear =
    body.graduationYear !== undefined && body.graduationYear !== ''
      ? Number(body.graduationYear)
      : current.graduationYear ?? null;
  if (graduationYear != null && (Number.isNaN(graduationYear) || graduationYear < 2020 || graduationYear > 2035)) {
    errors.push('Graduation year looks invalid.');
  }

  const backlogs = body.backlogs !== undefined && body.backlogs !== '' ? Number(body.backlogs) : current.backlogs ?? null;
  if (backlogs != null && (Number.isNaN(backlogs) || backlogs < 0)) errors.push('Backlogs cannot be negative.');

  const resumeUrl = body.resumeUrl !== undefined ? String(body.resumeUrl).trim() : current.resumeUrl || '';
  if (resumeUrl && !isHttpUrl(resumeUrl)) errors.push('Resume link must be a valid http(s) URL.');

  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const updated = {
    rollNo: body.rollNo !== undefined ? String(body.rollNo).trim() : current.rollNo || '',
    branch,
    cgpa,
    graduationYear,
    backlogs,
    phone: body.phone !== undefined ? String(body.phone).trim() : current.phone || '',
    resumeUrl,
    skills: body.skills !== undefined ? (Array.isArray(body.skills) ? body.skills.map((s) => String(s).trim()).filter(Boolean) : []) : current.skills || [],
    about: body.about !== undefined ? String(body.about).trim() : current.about || '',
    updatedAt: nowIso()
  };
  req.user.student = updated;
  store.save();
  res.json({ profile: updated, user: auth.publicUser(req.user) });
});

/* --------------------------- browse jobs --------------------------- */
router.get('/jobs', (req, res) => {
  const user = req.user;
  const q = String(req.query.q || '').toLowerCase();
  const type = String(req.query.type || '');
  const eligibleOnly = req.query.eligible === '1';

  const companies = Object.fromEntries(store.db().companies.map((c) => [c.id, c]));

  let jobs = store.db().jobs.filter((j) => {
    if (j.status !== 'approved') return false;
    const company = companies[j.companyId];
    if (!company || company.status !== 'approved') return false;
    return true;
  });

  if (q) {
    jobs = jobs.filter((j) => {
      const c = companies[j.companyId] || {};
      return [j.title, j.description, c.name, j.location, ...(j.skills || [])]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }
  if (type) jobs = jobs.filter((j) => j.type === type);

  const items = jobs
    .map((job) => {
      const existing = ownApplication(user.id, job.id);
      const evaluation = evaluateEligibility(user.student, job, { existingApplication: existing });
      return {
        ...jobWithCompany(job),
        applied: !!existing,
        applicationId: existing ? existing.id : null,
        applicationStatus: existing ? existing.status : null,
        eligibility: { eligible: evaluation.eligible, checks: evaluation.checks },
        deadlinePassed: new Date(job.deadline + 'T23:59:59').getTime() < Date.now()
      };
    })
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)));

  const visible = eligibleOnly ? items.filter((j) => j.eligibility.eligible) : items;
  res.json({ jobs: visible, total: visible.length });
});

router.get('/jobs/:id', (req, res) => {
  const job = store.findJob(req.params.id);
  if (!job || job.status !== 'approved') return res.status(404).json({ error: 'Job posting not found.' });
  const company = store.findCompany(job.companyId);
  if (!company || company.status !== 'approved') return res.status(404).json({ error: 'Job posting not found.' });

  const existing = ownApplication(req.user.id, job.id);
  const evaluation = evaluateEligibility(req.user.student, job, { existingApplication: existing });
  res.json({
    job: jobWithCompany(job),
    applied: !!existing,
    applicationId: existing ? existing.id : null,
    applicationStatus: existing ? existing.status : null,
    eligibility: evaluation
  });
});

/* --------------------------- apply (gated) --------------------------- */
router.post('/applications', (req, res) => {
  const jobId = String((req.body || {}).jobId || '');
  const job = store.findJob(jobId);
  if (!job || job.status !== 'approved') {
    return res.status(404).json({ error: 'Job posting not found or not open for applications.' });
  }
  const company = store.findCompany(job.companyId);
  if (!company || company.status !== 'approved') {
    return res.status(403).json({ error: 'This company is not currently approved on the portal.' });
  }

  const existing = ownApplication(req.user.id, job.id);
  if (existing) {
    return res.status(409).json({ error: `You have already applied to this posting (status: ${existing.status}).` });
  }

  /* SERVER-SIDE ELIGIBILITY GATE — the client cannot bypass this check. */
  const evaluation = evaluateEligibility(req.user.student, job, { existingApplication: null });
  if (!evaluation.eligible) {
    return res.status(403).json({
      error: 'Application blocked: you do not meet the eligibility criteria for this posting.',
      blockers: evaluation.blockers,
      checks: evaluation.checks
    });
  }

  const now = nowIso();
  const application = {
    id: store.nextId('app'),
    jobId: job.id,
    studentId: req.user.id,
    status: 'Applied',
    note: '',
    resumeSnapshot: (req.user.student && req.user.student.resumeUrl) || '',
    profileSnapshot: {
      cgpa: req.user.student && req.user.student.cgpa,
      branch: req.user.student && req.user.student.branch,
      graduationYear: req.user.student && req.user.student.graduationYear,
      backlogs: req.user.student && req.user.student.backlogs
    },
    timeline: [{ status: 'Applied', note: 'Application submitted by student.', by: req.user.id, byName: req.user.name, byRole: 'student', at: now }],
    createdAt: now,
    updatedAt: now
  };
  store.db().applications.push(application);
  store.save();
  res.status(201).json({ application: applicationWithJoin(application) });
});

/* ------------------------- track applications ------------------------- */
router.get('/applications', (req, res) => {
  const mine = store.db().applications
    .filter((a) => a.studentId === req.user.id)
    .map(applicationWithJoin)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  res.json({ applications: mine });
});

router.get('/applications/:id', (req, res) => {
  const app = store.findApplication(req.params.id);
  if (!app || app.studentId !== req.user.id) return res.status(404).json({ error: 'Application not found.' });
  res.json({ application: applicationWithJoin(app) });
});

router.post('/applications/:id/withdraw', (req, res) => {
  const app = store.findApplication(req.params.id);
  if (!app || app.studentId !== req.user.id) return res.status(404).json({ error: 'Application not found.' });
  if (app.status === 'Withdrawn') return res.status(409).json({ error: 'This application is already withdrawn.' });

  const now = nowIso();
  app.status = 'Withdrawn';
  app.timeline.push({ status: 'Withdrawn', note: 'Withdrawn by student.', by: req.user.id, byName: req.user.name, byRole: 'student', at: now });
  app.updatedAt = now;
  store.save();
  store.addLog({
    action: 'application.withdrawn',
    entityType: 'application',
    entityId: app.id,
    entityLabel: `${req.user.name} → ${store.findJob(app.jobId) ? store.findJob(app.jobId).title : app.jobId}`,
    actor: req.user
  });
  res.json({ application: applicationWithJoin(app) });
});

/* ----------------------------- dashboard ----------------------------- */
router.get('/dashboard', (req, res) => {
  const mine = store.db().applications.filter((a) => a.studentId === req.user.id);
  const byStatus = {};
  for (const a of mine) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

  const profile = req.user.student || {};
  const profileFields = [profile.branch, profile.cgpa > 0, profile.graduationYear, profile.resumeUrl, profile.rollNo, profile.phone];
  const completeness = Math.round((profileFields.filter(Boolean).length / profileFields.length) * 100);

  const openJobs = store.db().jobs.filter((j) => {
    if (j.status !== 'approved') return false;
    const c = store.findCompany(j.companyId);
    return c && c.status === 'approved';
  });
  const appliedJobIds = new Set(mine.map((a) => a.jobId));
  const recommended = openJobs
    .filter((j) => !appliedJobIds.has(j.id))
    .map((j) => {
      const evaluation = evaluateEligibility(profile, j, { existingApplication: null });
      return { ...jobWithCompany(j), eligible: evaluation.eligible, blockers: evaluation.blockers };
    })
    .sort((a, b) => Number(b.eligible) - Number(a.eligible) || String(a.deadline).localeCompare(String(b.deadline)))
    .slice(0, 4);

  res.json({
    stats: {
      total: mine.length,
      byStatus,
      shortlisted: (byStatus['Shortlisted'] || 0) + (byStatus['Interview'] || 0) + (byStatus['Offered'] || 0),
      offers: byStatus['Offered'] || 0
    },
    profileCompleteness: completeness,
    recommended,
    recent: mine
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, 5)
      .map(applicationWithJoin)
  });
});

module.exports = router;
