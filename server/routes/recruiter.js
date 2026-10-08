'use strict';
/** Recruiter routes: company profile, job postings, applicant review & status pipeline. */
const express = require('express');
const store = require('../db');
const auth = require('../auth');
const { validateJobPayload, RECRUITER_TRANSITIONS, isDeadlinePassed } = require('../eligibility');

const router = express.Router();
router.use(auth.requireRole('recruiter'));

const nowIso = () => new Date().toISOString();

function requireCompany(req, res) {
  const company = store.findCompanyByOwner(req.user.id);
  if (!company) {
    res.status(404).json({ error: 'No company profile found. Create your company profile first.' });
    return null;
  }
  return company;
}

function ownJob(req, res) {
  const job = store.findJob(req.params.id);
  if (!job || job.recruiterId !== req.user.id) {
    res.status(404).json({ error: 'Job posting not found.' });
    return null;
  }
  return job;
}

function jobWithCounts(job) {
  const apps = store.db().applications.filter((a) => a.jobId === job.id);
  const byStatus = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] || 0) + 1;
  return {
    ...job,
    deadlinePassed: isDeadlinePassed(job),
    applicantCount: apps.length,
    applicantsByStatus: byStatus
  };
}

function applicationDetail(app) {
  const job = store.findJob(app.jobId);
  const student = store.findUser(app.studentId);
  const s = (student && student.student) || {};
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
          eligibility: job.eligibility
        }
      : null,
    student: student
      ? {
          id: student.id,
          name: student.name,
          email: student.email,
          rollNo: s.rollNo || '',
          branch: s.branch || '',
          cgpa: s.cgpa ?? null,
          graduationYear: s.graduationYear ?? null,
          backlogs: s.backlogs ?? null,
          phone: s.phone || '',
          resumeUrl: s.resumeUrl || '',
          skills: s.skills || [],
          about: s.about || '',
          profileSnapshot: app.profileSnapshot || null
        }
      : null
  };
}

/* ------------------------------ company ------------------------------ */
router.get('/company', (req, res) => {
  const company = store.findCompanyByOwner(req.user.id);
  res.json({ company });
});

router.put('/company', (req, res) => {
  const body = req.body || {};
  const errors = [];
  const name = String(body.name || '').trim();
  if (!name) errors.push('Company name is required.');
  if (body.website && !/^https?:\/\/\S+$/i.test(String(body.website))) errors.push('Website must be a valid http(s) URL.');
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  let company = store.findCompanyByOwner(req.user.id);
  const now = nowIso();
  let resubmitted = false;

  if (!company) {
    company = {
      id: store.nextId('cmp'),
      ownerId: req.user.id,
      name,
      website: String(body.website || '').trim(),
      industry: String(body.industry || '').trim(),
      location: String(body.location || '').trim(),
      size: String(body.size || '').trim(),
      about: String(body.about || '').trim(),
      hrName: String(body.hrName || req.user.name).trim(),
      hrEmail: String(body.hrEmail || req.user.email).trim(),
      hrPhone: String(body.hrPhone || '').trim(),
      status: 'pending',
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
      actor: req.user,
      reason: 'Company profile created by recruiter; awaiting placement cell review.'
    });
  } else {
    Object.assign(company, {
      name,
      website: String(body.website || '').trim(),
      industry: String(body.industry || '').trim(),
      location: String(body.location || '').trim(),
      size: String(body.size || '').trim(),
      about: String(body.about || '').trim(),
      hrName: String(body.hrName || company.hrName || req.user.name).trim(),
      hrEmail: String(body.hrEmail || company.hrEmail || req.user.email).trim(),
      hrPhone: String(body.hrPhone || '').trim(),
      updatedAt: now
    });
    if (company.status === 'rejected') {
      // Editing a rejected profile re-enters the admin review queue.
      company.status = 'pending';
      company.decision = null;
      resubmitted = true;
      store.addLog({
        action: 'company.resubmitted',
        entityType: 'company',
        entityId: company.id,
        entityLabel: company.name,
        actor: req.user,
        reason: 'Recruiter updated a rejected company profile; re-submitted for review.'
      });
    }
  }

  store.save();
  res.json({ company, resubmitted });
});

/* --------------------------- job postings --------------------------- */
router.get('/jobs', (req, res) => {
  const jobs = store.db().jobs
    .filter((j) => j.recruiterId === req.user.id)
    .map(jobWithCounts)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ jobs, company: store.findCompanyByOwner(req.user.id) });
});

router.post('/jobs', (req, res) => {
  const company = requireCompany(req, res);
  if (!company) return;
  if (company.status === 'rejected') {
    return res.status(403).json({ error: 'Your company profile was rejected. Update and re-submit it before posting jobs.' });
  }

  const body = req.body || {};
  const { errors, minCgpa, maxBacklogs, allowed } = validateJobPayload(body);
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  const now = nowIso();
  const job = {
    id: store.nextId('job'),
    companyId: company.id,
    recruiterId: req.user.id,
    title: String(body.title).trim(),
    type: body.type || 'Full-time',
    location: String(body.location || '').trim(),
    workMode: String(body.workMode || 'On-site').trim(),
    ctc: String(body.ctc || '').trim(),
    description: String(body.description || '').trim(),
    responsibilities: Array.isArray(body.responsibilities) ? body.responsibilities.map((r) => String(r).trim()).filter(Boolean) : [],
    skills: Array.isArray(body.skills) ? body.skills.map((s) => String(s).trim()).filter(Boolean) : [],
    openings: body.openings != null && body.openings !== '' ? Number(body.openings) : null,
    deadline: String(body.deadline || '').trim(),
    eligibility: {
      minCgpa,
      maxBacklogs,
      allowedBranches: allowed,
      graduationYears: Array.isArray(body.eligibility && body.eligibility.graduationYears)
        ? body.eligibility.graduationYears.map(Number).filter(Number.isFinite)
        : []
    },
    status: 'pending', // every posting needs placement cell approval before students see it
    decision: null,
    createdAt: now,
    updatedAt: now
  };
  store.db().jobs.push(job);
  store.save();
  store.addLog({
    action: 'job.posted',
    entityType: 'job',
    entityId: job.id,
    entityLabel: `${job.title} — ${company.name}`,
    actor: req.user,
    reason: 'New posting submitted for placement cell approval.'
  });
  res.status(201).json({ job: jobWithCounts(job) });
});

router.get('/jobs/:id', (req, res) => {
  const job = ownJob(req, res);
  if (!job) return;
  res.json({ job: jobWithCounts(job), company: store.findCompanyByOwner(req.user.id) });
});

router.put('/jobs/:id', (req, res) => {
  const job = ownJob(req, res);
  if (!job) return;
  const body = req.body || {};
  const { errors, minCgpa, maxBacklogs, allowed } = validateJobPayload({ ...job, ...body });
  if (errors.length) return res.status(400).json({ error: errors.join(' ') });

  Object.assign(job, {
    title: String(body.title || job.title).trim(),
    type: body.type || job.type,
    location: body.location !== undefined ? String(body.location).trim() : job.location,
    workMode: body.workMode !== undefined ? String(body.workMode).trim() : job.workMode,
    ctc: body.ctc !== undefined ? String(body.ctc).trim() : job.ctc,
    description: body.description !== undefined ? String(body.description).trim() : job.description,
    responsibilities: Array.isArray(body.responsibilities)
      ? body.responsibilities.map((r) => String(r).trim()).filter(Boolean)
      : job.responsibilities,
    skills: Array.isArray(body.skills) ? body.skills.map((s) => String(s).trim()).filter(Boolean) : job.skills,
    openings: body.openings !== undefined && body.openings !== '' ? Number(body.openings) : job.openings,
    deadline: body.deadline !== undefined ? String(body.deadline).trim() : job.deadline
  });
  job.eligibility = {
    minCgpa,
    maxBacklogs,
    allowedBranches: allowed,
    graduationYears: Array.isArray(body.eligibility && body.eligibility.graduationYears)
      ? body.eligibility.graduationYears.map(Number).filter(Number.isFinite)
      : (job.eligibility && job.eligibility.graduationYears) || []
  };

  let resubmitted = false;
  if (job.status === 'approved') {
    // Policy: edits to a live posting go back through placement cell review.
    job.status = 'pending';
    job.decision = null;
    resubmitted = true;
    store.addLog({
      action: 'job.resubmitted',
      entityType: 'job',
      entityId: job.id,
      entityLabel: `${job.title} — ${store.findCompany(job.companyId).name}`,
      actor: req.user,
      reason: 'Recruiter edited an approved posting; returned to review queue.'
    });
  } else {
    job.status = 'pending';
    job.decision = null;
  }
  job.updatedAt = nowIso();
  store.save();
  res.json({ job: jobWithCounts(job), resubmitted });
});

router.post('/jobs/:id/close', (req, res) => {
  const job = ownJob(req, res);
  if (!job) return;
  if (job.status === 'closed') return res.status(409).json({ error: 'This posting is already closed.' });
  job.status = 'closed';
  job.updatedAt = nowIso();
  store.save();
  store.addLog({
    action: 'job.closed',
    entityType: 'job',
    entityId: job.id,
    entityLabel: `${job.title} — ${store.findCompany(job.companyId).name}`,
    actor: req.user,
    reason: 'Recruiter closed the posting.'
  });
  res.json({ job: jobWithCounts(job) });
});

router.post('/jobs/:id/reopen', (req, res) => {
  const job = ownJob(req, res);
  if (!job) return;
  if (job.status !== 'closed') return res.status(409).json({ error: 'Only closed postings can be reopened.' });
  job.status = 'pending'; // reopened postings go back through review
  job.updatedAt = nowIso();
  store.save();
  store.addLog({
    action: 'job.reopened',
    entityType: 'job',
    entityId: job.id,
    entityLabel: `${job.title} — ${store.findCompany(job.companyId).name}`,
    actor: req.user,
    reason: 'Recruiter reopened the posting; awaiting re-approval.'
  });
  res.json({ job: jobWithCounts(job) });
});

/* --------------------------- applicants --------------------------- */
router.get('/applicants', (req, res) => {
  const myJobs = store.db().jobs.filter((j) => j.recruiterId === req.user.id);
  const jobIds = new Set(myJobs.map((j) => j.id));
  const apps = store.db().applications
    .filter((a) => jobIds.has(a.jobId))
    .map(applicationDetail)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  res.json({ applications: apps, jobs: myJobs.map(jobWithCounts) });
});

router.get('/jobs/:id/applicants', (req, res) => {
  const job = ownJob(req, res);
  if (!job) return;
  const apps = store.db().applications
    .filter((a) => a.jobId === job.id)
    .map(applicationDetail)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  res.json({ job: jobWithCounts(job), applications: apps });
});

router.get('/applications/:id', (req, res) => {
  const app = store.findApplication(req.params.id);
  const job = app && store.findJob(app.jobId);
  if (!app || !job || job.recruiterId !== req.user.id) return res.status(404).json({ error: 'Application not found.' });
  res.json({ application: applicationDetail(app) });
});

/* ------------------- single & batch status transitions ------------------- */
function applyTransition(req, res) {
  const body = req.body || {};
  const ids = Array.isArray(body.ids) ? body.ids.map(String) : body.id ? [String(body.id)] : [];
  const status = String(body.status || '').trim();
  const note = String(body.note || '').trim();

  if (!ids.length) return res.status(400).json({ error: 'Provide application id(s) to update.' });
  if (!RECRUITER_TRANSITIONS.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${RECRUITER_TRANSITIONS.join(', ')}.` });
  }
  if (ids.length > 200) return res.status(400).json({ error: 'Batch updates are limited to 200 applications at a time.' });

  const updated = [];
  const skipped = [];
  for (const id of ids) {
    const app = store.findApplication(id);
    const job = app && store.findJob(app.jobId);
    if (!app || !job || job.recruiterId !== req.user.id) {
      skipped.push({ id, reason: 'Application not found.' });
      continue;
    }
    if (app.status === 'Withdrawn') {
      skipped.push({ id, reason: 'Application was withdrawn by the student.' });
      continue;
    }
    if (app.status === status && !note) {
      skipped.push({ id, reason: `Already ${status}.` });
      continue;
    }
    const from = app.status;
    const now = nowIso();
    app.status = status;
    app.timeline.push({
      status,
      note: note || (from === status ? 'Note added by recruiter.' : `Status changed from ${from} to ${status}.`),
      by: req.user.id,
      byName: req.user.name,
      byRole: 'recruiter',
      at: now
    });
    app.updatedAt = now;
    updated.push(app);

    store.addLog({
      action: 'application.status_changed',
      entityType: 'application',
      entityId: app.id,
      entityLabel: `${store.findUser(app.studentId) ? store.findUser(app.studentId).name : app.studentId} → ${job.title}`,
      actor: req.user,
      reason: note || null,
      meta: { from, to: status, batch: ids.length > 1 }
    });
  }

  if (updated.length) store.save();
  res.json({
    updatedCount: updated.length,
    updated: updated.map((a) => ({ id: a.id, status: a.status })),
    skipped
  });
}

router.patch('/applications/status', applyTransition);

/* ----------------------------- dashboard ----------------------------- */
router.get('/dashboard', (req, res) => {
  const company = store.findCompanyByOwner(req.user.id);
  const myJobs = store.db().jobs.filter((j) => j.recruiterId === req.user.id);
  const jobIds = new Set(myJobs.map((j) => j.id));
  const apps = store.db().applications.filter((a) => jobIds.has(a.jobId));
  const byStatus = {};
  for (const a of apps) byStatus[a.status] = (byStatus[a.status] || 0) + 1;

  res.json({
    company,
    stats: {
      jobs: myJobs.length,
      jobsByStatus: myJobs.reduce((acc, j) => ((acc[j.status] = (acc[j.status] || 0) + 1), acc), {}),
      applicants: apps.length,
      shortlisted: (byStatus['Shortlisted'] || 0) + (byStatus['Interview'] || 0) + (byStatus['Offered'] || 0),
      offers: byStatus['Offered'] || 0,
      newApplicants: byStatus['Applied'] || 0
    },
    recent: apps
      .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, 6)
      .map(applicationDetail)
  });
});

module.exports = router;
