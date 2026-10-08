'use strict';
/**
 * Server-side eligibility engine.
 *
 * Single source of truth for whether a student profile may apply to a posting.
 * Every check produces a human-readable explanation so the UI can render a
 * clear, actionable notice when submission is blocked.
 */

const BRANCHES = ['CSE', 'IT', 'ECE', 'EEE', 'Mechanical', 'Civil', 'Chemical', 'MCA'];

const APPLICATION_STATUSES = [
  'Applied',
  'Under Review',
  'Shortlisted',
  'Interview',
  'Offered',
  'Rejected',
  'Withdrawn'
];

/** Statuses a recruiter may move an application to (single or batch). */
const RECRUITER_TRANSITIONS = ['Under Review', 'Shortlisted', 'Interview', 'Offered', 'Rejected'];

const JOB_TYPES = ['Internship', 'Full-time'];
const WORK_MODES = ['On-site', 'Hybrid', 'Remote'];
const COMPANY_STATUSES = ['pending', 'approved', 'rejected'];
const JOB_STATUSES = ['pending', 'approved', 'rejected', 'closed'];

/**
 * @param {object|null} studentProfile user.student record
 * @param {object} job job document (with .eligibility)
 * @param {object} [opts] { existingApplication, companyStatus }
 * @returns {{eligible:boolean, checks:Array, blockers:string[]}}
 */
function evaluateEligibility(studentProfile, job, opts = {}) {
  const p = studentProfile || {};
  const e = job.eligibility || {};
  const checks = [];

  const push = (key, label, required, actual, pass, hint) => {
    checks.push({ key, label, required, actual, pass: !!pass, hint: hint || null });
    return pass;
  };

  /* 1. profile completeness — cannot gate against an empty profile */
  const profileComplete = !!(p.cgpa > 0 && p.branch && p.graduationYear && p.resumeUrl);
  push(
    'profile',
    'Profile completed',
    'CGPA, branch, graduation year and resume link filled in',
    profileComplete ? 'Complete' : 'Incomplete',
    profileComplete,
    profileComplete ? null : 'Open Profile and save your branch, CGPA, graduation year and resume link before applying.'
  );

  /* 2. minimum CGPA */
  if (e.minCgpa != null && e.minCgpa !== '') {
    push(
      'cgpa',
      'Minimum CGPA',
      `≥ ${e.minCgpa}`,
      p.cgpa != null ? String(p.cgpa) : '—',
      p.cgpa != null && Number(p.cgpa) >= Number(e.minCgpa)
    );
  }

  /* 3. allowed departments */
  if (Array.isArray(e.allowedBranches) && e.allowedBranches.length) {
    push(
      'branch',
      'Allowed departments',
      e.allowedBranches.join(', '),
      p.branch || '—',
      !!p.branch && e.allowedBranches.includes(p.branch)
    );
  }

  /* 4. graduation years */
  if (Array.isArray(e.graduationYears) && e.graduationYears.length) {
    push(
      'gradYear',
      'Graduation year',
      e.graduationYears.join(', '),
      p.graduationYear ? String(p.graduationYear) : '—',
      !!p.graduationYear && e.graduationYears.map(Number).includes(Number(p.graduationYear))
    );
  }

  /* 5. maximum active backlogs */
  if (e.maxBacklogs != null && e.maxBacklogs !== '') {
    push(
      'backlogs',
      'Maximum active backlogs',
      `≤ ${e.maxBacklogs}`,
      p.backlogs != null ? String(p.backlogs) : '—',
      p.backlogs != null && Number(p.backlogs) <= Number(e.maxBacklogs)
    );
  }

  /* 6. posting must be live */
  const postingLive = job.status === 'approved' && !isDeadlinePassed(job);
  push(
    'posting',
    'Posting is open',
    job.status === 'approved' ? `Apply before ${job.deadline || '—'}` : 'Posting not open',
    job.status === 'approved' ? (isDeadlinePassed(job) ? 'Deadline passed' : 'Open') : `Posting ${job.status}`,
    postingLive,
    isDeadlinePassed(job) ? 'The application deadline for this posting has passed.' : null
  );

  /* 7. no duplicate application */
  const duplicate = !!opts.existingApplication;
  push(
    'duplicate',
    'One application per posting',
    'You have not applied yet',
    duplicate ? `Already ${opts.existingApplication.status}` : 'Not applied',
    !duplicate,
    duplicate ? `You already applied to this posting (current status: ${opts.existingApplication.status}).` : null
  );

  const blockers = checks.filter((c) => !c.pass).map((c) => c.hint || `${c.label}: required ${c.required}, you have ${c.actual}.`);
  return { eligible: blockers.length === 0, checks, blockers };
}

function isDeadlinePassed(job) {
  if (!job.deadline) return false;
  const end = new Date(job.deadline + 'T23:59:59');
  return !Number.isNaN(end.getTime()) && end.getTime() < Date.now();
}

/** Basic server-side validation for an incoming job payload. */
function validateJobPayload(body) {
  const errors = [];
  if (!body.title || !String(body.title).trim()) errors.push('Job title is required.');
  const type = body.type || 'Full-time';
  if (!JOB_TYPES.includes(type)) errors.push(`Job type must be one of: ${JOB_TYPES.join(', ')}.`);
  const minCgpa = numOrNull(body.eligibility && body.eligibility.minCgpa);
  if (minCgpa != null && (minCgpa < 0 || minCgpa > 10)) errors.push('Minimum CGPA must be between 0 and 10.');
  const maxBacklogs = numOrNull(body.eligibility && body.eligibility.maxBacklogs);
  if (maxBacklogs != null && maxBacklogs < 0) errors.push('Maximum backlogs cannot be negative.');
  const allowed = (body.eligibility && body.eligibility.allowedBranches) || [];
  if (!Array.isArray(allowed)) errors.push('Allowed departments must be a list.');
  const badBranch = Array.isArray(allowed) && allowed.find((b) => !BRANCHES.includes(b));
  if (badBranch) errors.push(`Unknown department "${badBranch}". Valid: ${BRANCHES.join(', ')}.`);
  if (body.deadline) {
    const d = new Date(body.deadline + 'T23:59:59');
    if (Number.isNaN(d.getTime())) errors.push('Deadline must be a valid date (YYYY-MM-DD).');
  }
  return { errors, minCgpa, maxBacklogs, allowed };
}

function numOrNull(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

module.exports = {
  BRANCHES,
  APPLICATION_STATUSES,
  RECRUITER_TRANSITIONS,
  JOB_TYPES,
  WORK_MODES,
  COMPANY_STATUSES,
  JOB_STATUSES,
  evaluateEligibility,
  isDeadlinePassed,
  validateJobPayload
};
