'use strict';
/** Placement cell (admin) routes: approvals for companies & postings + audit logs. */
const express = require('express');
const store = require('../db');
const auth = require('../auth');
const { COMPANY_STATUSES, JOB_STATUSES } = require('../eligibility');

const router = express.Router();
router.use(auth.requireRole('admin'));

const nowIso = () => new Date().toISOString();

function countBy(list, key) {
  return list.reduce((acc, item) => {
    const k = item[key] || 'unknown';
    acc[k] = (acc[k] || 0) + 1;
    return acc;
  }, {});
}

function companyView(company) {
  const owner = store.findUser(company.ownerId);
  const jobs = store.db().jobs.filter((j) => j.companyId === company.id);
  return {
    ...company,
    ownerName: owner ? owner.name : 'Unknown',
    ownerEmail: owner ? owner.email : '',
    jobCount: jobs.length,
    pendingJobs: jobs.filter((j) => j.status === 'pending').length
  };
}

function jobView(job) {
  const company = store.findCompany(job.companyId);
  const apps = store.db().applications.filter((a) => a.jobId === job.id);
  return {
    ...job,
    companyName: company ? company.name : 'Unknown',
    companyStatus: company ? company.status : 'unknown',
    applicantCount: apps.length
  };
}

/* ------------------------------ overview ------------------------------ */
router.get('/overview', (req, res) => {
  const db = store.db();
  const companies = db.companies;
  const jobs = db.jobs;
  const apps = db.applications;

  res.json({
    stats: {
      students: db.users.filter((u) => u.role === 'student').length,
      recruiters: db.users.filter((u) => u.role === 'recruiter').length,
      companies: companies.length,
      companiesByStatus: countBy(companies, 'status'),
      jobs: jobs.length,
      jobsByStatus: countBy(jobs, 'status'),
      applications: apps.length,
      applicationsByStatus: countBy(apps, 'status'),
      offers: apps.filter((a) => a.status === 'Offered').length
    },
    pendingCompanies: companies.filter((c) => c.status === 'pending').map(companyView).slice(0, 5),
    pendingJobs: jobs.filter((j) => j.status === 'pending').map(jobView).slice(0, 5),
    recentLogs: db.logs.slice(0, 6)
  });
});

/* --------------------------- company approvals --------------------------- */
router.get('/companies', (req, res) => {
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').toLowerCase();
  let list = store.db().companies;
  if (status && COMPANY_STATUSES.includes(status)) list = list.filter((c) => c.status === status);
  if (q) list = list.filter((c) => [c.name, c.industry, c.location, c.ownerId].join(' ').toLowerCase().includes(q));
  const items = list
    .map(companyView)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ companies: items, total: items.length });
});

router.post('/companies/:id/decision', (req, res) => {
  const company = store.findCompany(req.params.id);
  if (!company) return res.status(404).json({ error: 'Company not found.' });
  const body = req.body || {};
  const decision = String(body.decision || '');
  const reason = String(body.reason || '').trim();
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be "approve" or "reject".' });
  }
  if (decision === 'reject' && !reason) {
    return res.status(400).json({ error: 'A reason is required when rejecting a company.' });
  }

  const now = nowIso();
  company.status = decision === 'approve' ? 'approved' : 'rejected';
  company.decision = { by: req.user.id, byName: req.user.name, at: now, decision, reason: reason || 'Verified by the placement cell.' };
  company.updatedAt = now;

  /* Rejecting a company also rejects its postings that are still in the queue. */
  let cascaded = 0;
  if (decision === 'reject') {
    for (const job of store.db().jobs.filter((j) => j.companyId === company.id && j.status === 'pending')) {
      job.status = 'rejected';
      job.decision = { by: req.user.id, byName: req.user.name, at: now, decision: 'reject', reason: 'Company registration was rejected.' };
      job.updatedAt = now;
      cascaded += 1;
      store.addLog({
        action: 'job.rejected',
        entityType: 'job',
        entityId: job.id,
        entityLabel: `${job.title} — ${company.name}`,
        actor: req.user,
        reason: 'Auto-rejected because the company registration was rejected.',
        meta: { cascade: true }
      });
    }
  }

  store.save();
  const log = store.addLog({
    action: decision === 'approve' ? 'company.approved' : 'company.rejected',
    entityType: 'company',
    entityId: company.id,
    entityLabel: company.name,
    actor: req.user,
    reason: reason || null,
    meta: cascaded ? { cascadedJobs: cascaded } : null
  });

  res.json({ company: companyView(company), log, cascadedJobs: cascaded });
});

/* ---------------------------- job approvals ---------------------------- */
router.get('/jobs', (req, res) => {
  const status = String(req.query.status || '');
  const q = String(req.query.q || '').toLowerCase();
  let list = store.db().jobs;
  if (status && JOB_STATUSES.includes(status)) list = list.filter((j) => j.status === status);
  if (q) list = list.filter((j) => [j.title, j.description, store.findCompany(j.companyId)?.name || ''].join(' ').toLowerCase().includes(q));
  const items = list.map(jobView).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  res.json({ jobs: items, total: items.length });
});

router.post('/jobs/:id/decision', (req, res) => {
  const job = store.findJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job posting not found.' });
  const body = req.body || {};
  const decision = String(body.decision || '');
  const reason = String(body.reason || '').trim();
  if (!['approve', 'reject'].includes(decision)) {
    return res.status(400).json({ error: 'Decision must be "approve" or "reject".' });
  }
  if (decision === 'reject' && !reason) {
    return res.status(400).json({ error: 'A reason is required when rejecting a posting.' });
  }
  const company = store.findCompany(job.companyId);
  if (decision === 'approve' && (!company || company.status !== 'approved')) {
    return res.status(409).json({ error: 'Approve the company profile before approving its postings.' });
  }

  const now = nowIso();
  job.status = decision === 'approve' ? 'approved' : 'rejected';
  job.decision = { by: req.user.id, byName: req.user.name, at: now, decision, reason: reason || 'Reviewed by the placement cell.' };
  job.updatedAt = now;
  store.save();

  const log = store.addLog({
    action: decision === 'approve' ? 'job.approved' : 'job.rejected',
    entityType: 'job',
    entityId: job.id,
    entityLabel: `${job.title} — ${company ? company.name : 'Unknown'}`,
    actor: req.user,
    reason: reason || null
  });

  res.json({ job: jobView(job), log });
});

/* ------------------------------ audit logs ------------------------------ */
router.get('/logs', (req, res) => {
  const { action, entityType, actorRole, q } = req.query;
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  let logs = store.db().logs;
  if (action) logs = logs.filter((l) => l.action === action);
  if (entityType) logs = logs.filter((l) => l.entityType === entityType);
  if (actorRole) logs = logs.filter((l) => l.actorRole === actorRole);
  if (q) {
    const needle = String(q).toLowerCase();
    logs = logs.filter((l) =>
      [l.action, l.entityLabel, l.actorName, l.actorId, l.reason].filter(Boolean).join(' ').toLowerCase().includes(needle)
    );
  }
  const actions = [...new Set(store.db().logs.map((l) => l.action))].sort();
  res.json({ logs: logs.slice(0, limit), total: logs.length, actions });
});

/* ------------------------------- users ------------------------------- */
router.get('/users', (req, res) => {
  const role = String(req.query.role || '');
  let users = store.db().users.map(auth.publicUser);
  if (role) users = users.filter((u) => u.role === role);
  res.json({ users, total: users.length });
});

module.exports = router;
