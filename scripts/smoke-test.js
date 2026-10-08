'use strict';
/**
 * End-to-end API smoke test (no test framework needed).
 *
 *   npm run check      → starts nothing; expects the server running on :3000
 *   node scripts/smoke-test.js reset   → re-seed, restart server, then run this
 *
 * Covers: auth, role boundaries, server-side eligibility gating, the recruiter
 * pipeline (single + batch transitions), admin approvals and the audit log.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3000';

let passed = 0;
let failed = 0;
function ok(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ✔ ${name}`);
  } else {
    failed++;
    console.error(`  ✘ ${name}${extra ? ' — ' + extra : ''}`);
  }
}

/** Minimal cookie-jar client. */
function client() {
  let cookie = '';
  return {
    async call(method, path, body) {
      const res = await fetch(BASE + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(cookie ? { Cookie: cookie } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
      const setCookie = res.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* non-JSON */
      }
      return { status: res.status, json };
    }
  };
}

async function main() {
  console.log(`Smoke-testing ${BASE}\n`);

  /* ---------------- health & meta ---------------- */
  const health = await fetch(BASE + '/api/health').then((r) => r.json());
  ok('health endpoint responds', health.ok === true);

  /* ---------------- login failures ---------------- */
  const anon = client();
  const badLogin = await anon.call('POST', '/api/auth/login', { email: 'admin@campus.edu', password: 'wrong' });
  ok('wrong password rejected (401)', badLogin.status === 401);

  /* ---------------- student flow ---------------- */
  const student = client();
  const sLogin = await student.call('POST', '/api/auth/login', { email: 'aarav@student.campus.edu', password: 'student123' });
  ok('student login', sLogin.status === 200 && sLogin.json.user.role === 'student');

  const sJobs = await student.call('GET', '/api/student/jobs');
  ok('student sees only approved jobs', sJobs.status === 200 && sJobs.json.jobs.every((j) => j.status === 'approved'));
  ok('seeded dataset has open approved jobs', sJobs.json.jobs.length >= 3, `got ${sJobs.json.jobs.length}`);

  const mlJob = sJobs.json.jobs.find((j) => j.title === 'Machine Learning Intern');
  const cloudJob = sJobs.json.jobs.find((j) => j.title === 'Cloud Support Engineer');

  const gated = await student.call('POST', '/api/student/applications', { jobId: cloudJob.id });
  ok('deadline-passed posting blocked server-side (403)', gated.status === 403 && Array.isArray(gated.json.blockers));

  /* Diya (IT, CGPA 7.2) is eligible for the Frontend Developer posting and has not applied yet. */
  const diya = client();
  await diya.call('POST', '/api/auth/login', { email: 'diya@student.campus.edu', password: 'student123' });
  const feJob = sJobs.json.jobs.find((j) => j.title === 'Frontend Developer (Full-time)');
  const apply = await diya.call('POST', '/api/student/applications', { jobId: feJob.id });
  ok('eligible student can apply (201)', apply.status === 201 && apply.json.application.status === 'Applied', JSON.stringify(apply.json));
  const newApplicationId = apply.json.application && apply.json.application.id;

  const dupe = await diya.call('POST', '/api/student/applications', { jobId: feJob.id });
  ok('duplicate application rejected (409)', dupe.status === 409);

  const ineligibleStudent = client();
  await ineligibleStudent.call('POST', '/api/auth/login', { email: 'kabir@student.campus.edu', password: 'student123' });
  const blocked = await ineligibleStudent.call('POST', '/api/student/applications', { jobId: mlJob.id });
  ok(
    'CGPA-blocked student gets 403 with explanatory blockers',
    blocked.status === 403 && blocked.json.blockers.length > 0,
    JSON.stringify(blocked.json)
  );
  console.log(`      blocker notice: "${blocked.json.blockers[0]}"`);

  const sAdmin = await student.call('GET', '/api/admin/overview');
  ok('student blocked from admin API (403)', sAdmin.status === 403);

  /* ---------------- recruiter flow ---------------- */
  const recruiter = client();
  const rLogin = await recruiter.call('POST', '/api/auth/login', { email: 'priya@technova.io', password: 'recruiter123' });
  ok('recruiter login', rLogin.status === 200 && rLogin.json.user.role === 'recruiter');
  ok('recruiter company is approved', rLogin.json.company.status === 'approved');

  const rJobs = await recruiter.call('GET', '/api/recruiter/jobs');
  const seJob = rJobs.json.jobs.find((j) => j.title === 'Software Engineer Intern');
  ok('recruiter sees own jobs with applicant counts', seJob.applicantCount >= 2);

  const applicants = await recruiter.call('GET', '/api/recruiter/applicants');
  ok('recruiter can review candidate profiles', applicants.json.applications.every((a) => a.student && a.student.cgpa !== undefined));

  const freshApp = applicants.json.applications.find((a) => a.id === newApplicationId) || applicants.json.applications.find((a) => a.status === 'Applied');
  const single = await recruiter.call('PATCH', '/api/recruiter/applications/status', {
    id: freshApp.id,
    status: 'Under Review',
    note: 'Screening resume against criteria.'
  });
  ok('single status transition works', single.status === 200 && single.json.updatedCount === 1);

  let batchIds = applicants.json.applications.filter((a) => a.status === 'Under Review').map((a) => a.id);
  if (!batchIds.length) batchIds = applicants.json.applications.slice(0, 2).map((a) => a.id);
  const batch = await recruiter.call('PATCH', '/api/recruiter/applications/status', {
    ids: batchIds,
    status: 'Rejected',
    note: 'Batch rejection after screening.'
  });
  ok('batch status transition works', batch.status === 200 && batch.json.updatedCount >= 1);

  const badTransition = await recruiter.call('PATCH', '/api/recruiter/applications/status', { id: freshApp.id, status: 'Hired!' });
  ok('invalid status rejected (400)', badTransition.status === 400);

  const rAdmin = await recruiter.call('GET', '/api/admin/logs');
  ok('recruiter blocked from admin API (403)', rAdmin.status === 403);

  /* ---------------- admin flow ---------------- */
  const admin = client();
  const aLogin = await admin.call('POST', '/api/auth/login', { email: 'admin@campus.edu', password: 'admin123' });
  ok('admin login', aLogin.status === 200 && aLogin.json.user.role === 'admin');

  const pendingCompanies = await admin.call('GET', '/api/admin/companies?status=pending');
  const brightsoft = pendingCompanies.json.companies.find((c) => c.name === 'BrightSoft Solutions');
  ok('pending company appears in admin queue', !!brightsoft);

  const approveCompany = await admin.call('POST', `/api/admin/companies/${brightsoft.id}/decision`, {
    decision: 'approve',
    reason: 'Registration verified.'
  });
  ok('admin can approve company', approveCompany.status === 200 && approveCompany.json.company.status === 'approved');

  const pendingJobs = await admin.call('GET', '/api/admin/jobs?status=pending');
  const qaJob = pendingJobs.json.jobs.find((j) => j.title === 'QA Automation Intern');
  const approveJob = await admin.call('POST', `/api/admin/jobs/${qaJob.id}/decision`, { decision: 'approve', reason: '' });
  ok('admin can approve posting', approveJob.status === 200 && approveJob.json.job.status === 'approved');

  const rejectNoReason = await admin.call('POST', `/api/admin/jobs/${pendingJobs.json.jobs[0].id}/decision`, { decision: 'reject', reason: '' });
  ok('rejection without reason rejected (400)', rejectNoReason.status === 400);

  const logs = await admin.call('GET', '/api/admin/logs');
  ok(
    'audit log records approvals with reviewer id + timestamp',
    logs.json.logs.some((l) => l.action === 'company.approved' && l.actorId === 'usr_0001' && l.timestamp) &&
      logs.json.logs.some((l) => l.action === 'application.status_changed' && l.meta && l.meta.batch === true)
  );

  /* ---------------- logged out ---------------- */
  const anonJobs = await client().call('GET', '/api/student/jobs');
  ok('anonymous blocked from API (401)', anonJobs.status === 401);

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err.message);
  process.exit(1);
});
