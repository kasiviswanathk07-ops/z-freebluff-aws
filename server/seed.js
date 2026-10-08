'use strict';
/**
 * Sample database population.
 *
 *   npm run seed       → writes a fresh demo dataset to data/db.json
 *   npm run reset      → same thing (alias, keeps old name for muscle memory)
 *
 * Every password below is hashed with bcrypt before being stored.
 */
const store = require('./db');
const { hashPassword } = require('./auth');

function dateStr(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
}
function iso(daysAgo, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function seed(opts = {}) {
  const now = new Date().toISOString();
  store.reset({
    meta: { version: 1, createdAt: now, counters: {} },
    users: [],
    companies: [],
    jobs: [],
    applications: [],
    logs: [],
    sessions: []
  });

  /* ------------------------------- users ------------------------------- */
  const users = [
    {
      id: 'usr_0001',
      role: 'admin',
      name: 'Dr. Meera Iyer',
      email: 'admin@campus.edu',
      passwordHash: hashPassword('admin123'),
      status: 'active',
      createdAt: iso(30)
    },
    {
      id: 'usr_0002',
      role: 'recruiter',
      name: 'Priya Deshmukh',
      email: 'priya@technova.io',
      passwordHash: hashPassword('recruiter123'),
      status: 'active',
      createdAt: iso(25)
    },
    {
      id: 'usr_0003',
      role: 'recruiter',
      name: 'Arjun Mehta',
      email: 'arjun@brightsoft.in',
      passwordHash: hashPassword('recruiter123'),
      status: 'active',
      createdAt: iso(2)
    },
    {
      id: 'usr_0004',
      role: 'recruiter',
      name: 'Rahul Verma',
      email: 'rahul@dataforge.ai',
      passwordHash: hashPassword('recruiter123'),
      status: 'active',
      createdAt: iso(20)
    },
    {
      id: 'usr_0005',
      role: 'student',
      name: 'Aarav Sharma',
      email: 'aarav@student.campus.edu',
      passwordHash: hashPassword('student123'),
      status: 'active',
      createdAt: iso(28),
      student: {
        rollNo: 'CS21B045',
        branch: 'CSE',
        cgpa: 8.6,
        graduationYear: 2026,
        backlogs: 0,
        phone: '+91 98100 11111',
        resumeUrl: 'https://drive.google.com/resume-aarav-sharma',
        skills: ['JavaScript', 'React', 'Node.js', 'SQL', 'Git'],
        about: 'Final-year CSE student. Full-stack projects, 2 hackathon wins, looking for product engineering roles.',
        updatedAt: iso(27)
      }
    },
    {
      id: 'usr_0006',
      role: 'student',
      name: 'Diya Patel',
      email: 'diya@student.campus.edu',
      passwordHash: hashPassword('student123'),
      status: 'active',
      createdAt: iso(26),
      student: {
        rollNo: 'IT21A112',
        branch: 'IT',
        cgpa: 7.2,
        graduationYear: 2026,
        backlogs: 0,
        phone: '+91 98100 22222',
        resumeUrl: 'https://drive.google.com/resume-diya-patel',
        skills: ['Python', 'Django', 'PostgreSQL', 'Power BI'],
        about: 'IT undergrad interested in data analytics and backend development.',
        updatedAt: iso(25)
      }
    },
    {
      id: 'usr_0007',
      role: 'student',
      name: 'Kabir Singh',
      email: 'kabir@student.campus.edu',
      passwordHash: hashPassword('student123'),
      status: 'active',
      createdAt: iso(24),
      student: {
        rollNo: 'EC21C077',
        branch: 'ECE',
        cgpa: 6.4,
        graduationYear: 2026,
        backlogs: 1,
        phone: '',
        resumeUrl: '', // intentionally incomplete → shows the "complete your profile" gate
        skills: ['Embedded C', 'IoT'],
        about: 'Electronics enthusiast.',
        updatedAt: iso(23)
      }
    },
    {
      id: 'usr_0008',
      role: 'student',
      name: 'Meera Nair',
      email: 'meera@student.campus.edu',
      passwordHash: hashPassword('student123'),
      status: 'active',
      createdAt: iso(22),
      student: {
        rollNo: 'CS22D018',
        branch: 'CSE',
        cgpa: 9.1,
        graduationYear: 2027, // pre-final year → blocked from 2026-only drives
        backlogs: 0,
        phone: '+91 98100 44444',
        resumeUrl: 'https://drive.google.com/resume-meera-nair',
        skills: ['C++', 'Algorithms', 'Machine Learning', 'PyTorch'],
        about: 'Third-year CSE student, competitive programmer (ICPC regionals).',
        updatedAt: iso(21)
      }
    }
  ];
  store.db().users.push(...users);

  /* ----------------------------- companies ----------------------------- */
  const companies = [
    {
      id: 'cmp_0001',
      ownerId: 'usr_0002',
      name: 'TechNova Labs',
      website: 'https://technova.example.com',
      industry: 'Product / SaaS',
      location: 'Bengaluru, KA',
      size: '201-500',
      about: 'Series-B SaaS company building workflow automation for mid-market teams.',
      hrName: 'Priya Deshmukh',
      hrEmail: 'priya@technova.io',
      hrPhone: '+91 90000 10001',
      status: 'approved',
      decision: { by: 'usr_0001', byName: 'Dr. Meera Iyer', at: iso(24), decision: 'approve', reason: 'Verified company registration and internship policy documents.' },
      createdAt: iso(25),
      updatedAt: iso(24)
    },
    {
      id: 'cmp_0002',
      ownerId: 'usr_0003',
      name: 'BrightSoft Solutions',
      website: 'https://brightsoft.example.in',
      industry: 'IT Services',
      location: 'Pune, MH',
      size: '51-200',
      about: 'IT services firm specialising in QA automation and analytics consulting.',
      hrName: 'Arjun Mehta',
      hrEmail: 'arjun@brightsoft.in',
      hrPhone: '+91 90000 20002',
      status: 'pending', // ← sits in the admin approval queue
      decision: null,
      createdAt: iso(2),
      updatedAt: iso(2)
    },
    {
      id: 'cmp_0003',
      ownerId: 'usr_0004',
      name: 'DataForge Analytics',
      website: 'https://dataforge.example.ai',
      industry: 'AI / Data',
      location: 'Hyderabad, TS',
      size: '501-1000',
      about: 'Applied AI consultancy working with retail and healthcare clients.',
      hrName: 'Rahul Verma',
      hrEmail: 'rahul@dataforge.ai',
      hrPhone: '+91 90000 30003',
      status: 'approved',
      decision: { by: 'usr_0001', byName: 'Dr. Meera Iyer', at: iso(19), decision: 'approve', reason: 'Approved after campus MoU verification.' },
      createdAt: iso(20),
      updatedAt: iso(19)
    }
  ];
  store.db().companies.push(...companies);

  /* -------------------------------- jobs -------------------------------- */
  const jobs = [
    {
      id: 'job_0001',
      companyId: 'cmp_0001',
      recruiterId: 'usr_0002',
      title: 'Software Engineer Intern',
      type: 'Internship',
      location: 'Bengaluru, KA',
      workMode: 'Hybrid',
      ctc: '₹35,000/month stipend',
      description: 'Join our platform team to build and ship features across our workflow automation suite. Strong mentorship, real ownership from week one.',
      responsibilities: ['Build REST APIs in Node.js', 'Ship UI features with React', 'Write tests and review code'],
      skills: ['JavaScript', 'Node.js', 'React', 'Git'],
      openings: 4,
      deadline: dateStr(21),
      eligibility: { minCgpa: 7.5, maxBacklogs: 0, allowedBranches: ['CSE', 'IT'], graduationYears: [2026] },
      status: 'approved',
      decision: { by: 'usr_0001', byName: 'Dr. Meera Iyer', at: iso(23), decision: 'approve', reason: 'Eligibility criteria verified against placement policy.' },
      createdAt: iso(24),
      updatedAt: iso(23)
    },
    {
      id: 'job_0002',
      companyId: 'cmp_0001',
      recruiterId: 'usr_0002',
      title: 'Frontend Developer (Full-time)',
      type: 'Full-time',
      location: 'Bengaluru, KA',
      workMode: 'Hybrid',
      ctc: '₹12-14 LPA',
      description: 'Own the customer-facing web app: design systems, performance and accessibility.',
      responsibilities: ['Build design-system components', 'Improve Core Web Vitals', 'Pair with designers'],
      skills: ['React', 'TypeScript', 'CSS', 'Accessibility'],
      openings: 2,
      deadline: dateStr(14),
      eligibility: { minCgpa: 7.0, maxBacklogs: 1, allowedBranches: ['CSE', 'IT', 'ECE'], graduationYears: [2026, 2027] },
      status: 'approved',
      decision: { by: 'usr_0001', byName: 'Dr. Meera Iyer', at: iso(18), decision: 'approve', reason: null },
      createdAt: iso(19),
      updatedAt: iso(18)
    },
    {
      id: 'job_0003',
      companyId: 'cmp_0001',
      recruiterId: 'usr_0002',
      title: 'Data Analyst Intern',
      type: 'Internship',
      location: 'Remote',
      workMode: 'Remote',
      ctc: '₹25,000/month stipend',
      description: 'Work with the growth team on funnel analytics and dashboards.',
      responsibilities: ['Build SQL reports', 'Maintain dashboards', 'A/B test analysis'],
      skills: ['SQL', 'Python', 'Excel'],
      openings: 2,
      deadline: dateStr(30),
      eligibility: { minCgpa: 6.5, maxBacklogs: 2, allowedBranches: ['CSE', 'IT', 'ECE', 'MCA'], graduationYears: [2026, 2027] },
      status: 'pending', // ← awaiting admin approval
      decision: null,
      createdAt: iso(1),
      updatedAt: iso(1)
    },
    {
      id: 'job_0004',
      companyId: 'cmp_0001',
      recruiterId: 'usr_0002',
      title: 'Cloud Support Engineer',
      type: 'Full-time',
      location: 'Bengaluru, KA',
      workMode: 'On-site',
      ctc: '₹8-10 LPA',
      description: 'L1/L2 cloud support for enterprise customers with a path into SRE.',
      responsibilities: ['Triage incidents', 'Automate runbooks', 'Customer comms'],
      skills: ['Linux', 'AWS', 'Networking'],
      openings: 3,
      deadline: dateStr(-4), // deadline already passed → submission blocked with a clear notice
      eligibility: { minCgpa: 6.0, maxBacklogs: 2, allowedBranches: ['CSE', 'IT', 'ECE', 'EEE'], graduationYears: [2026] },
      status: 'approved',
      decision: { by: 'usr_0001', byName: 'Dr. Meera Iyer', at: iso(17), decision: 'approve', reason: null },
      createdAt: iso(18),
      updatedAt: iso(17)
    },
    {
      id: 'job_0005',
      companyId: 'cmp_0003',
      recruiterId: 'usr_0004',
      title: 'Machine Learning Intern',
      type: 'Internship',
      location: 'Hyderabad, TS',
      workMode: 'Hybrid',
      ctc: '₹40,000/month stipend',
      description: 'Prototype recommendation and forecasting models on live retail datasets.',
      responsibilities: ['Train and evaluate models', 'Build data pipelines', 'Present findings'],
      skills: ['Python', 'PyTorch', 'Pandas', 'ML'],
      openings: 2,
      deadline: dateStr(18),
      eligibility: { minCgpa: 8.0, maxBacklogs: 0, allowedBranches: ['CSE', 'IT', 'ECE'], graduationYears: [2026, 2027] },
      status: 'approved',
      decision: { by: 'usr_0001', byName: 'Dr. Meera Iyer', at: iso(18), decision: 'approve', reason: 'High-CTA internship; criteria within policy limits.' },
      createdAt: iso(19),
      updatedAt: iso(18)
    },
    {
      id: 'job_0006',
      companyId: 'cmp_0003',
      recruiterId: 'usr_0004',
      title: 'Backend Engineer (Full-time)',
      type: 'Full-time',
      location: 'Hyderabad, TS',
      workMode: 'On-site',
      ctc: '₹16-18 LPA',
      description: 'Design services powering real-time inventory signals for retail clients.',
      responsibilities: ['Design APIs', 'Own PostgreSQL schemas', 'On-call rotation'],
      skills: ['Java', 'PostgreSQL', 'Kafka'],
      openings: 2,
      deadline: dateStr(25),
      eligibility: { minCgpa: 8.5, maxBacklogs: 0, allowedBranches: ['CSE', 'IT'], graduationYears: [2026] },
      status: 'pending', // ← awaiting admin approval
      decision: null,
      createdAt: iso(1),
      updatedAt: iso(1)
    },
    {
      id: 'job_0007',
      companyId: 'cmp_0002',
      recruiterId: 'usr_0003',
      title: 'QA Automation Intern',
      type: 'Internship',
      location: 'Pune, MH',
      workMode: 'On-site',
      ctc: '₹20,000/month stipend',
      description: 'Automate regression suites for client engagements.',
      responsibilities: ['Write Playwright tests', 'Maintain CI pipelines'],
      skills: ['JavaScript', 'Playwright'],
      openings: 3,
      deadline: dateStr(28),
      eligibility: { minCgpa: 6.0, maxBacklogs: 2, allowedBranches: ['CSE', 'IT', 'ECE'], graduationYears: [2026] },
      status: 'pending', // blocked until company cmp_0002 is approved
      decision: null,
      createdAt: iso(2),
      updatedAt: iso(2)
    },
    {
      id: 'job_0008',
      companyId: 'cmp_0002',
      recruiterId: 'usr_0003',
      title: 'Business Analyst Intern',
      type: 'Internship',
      location: 'Pune, MH',
      workMode: 'Hybrid',
      ctc: '₹22,000/month stipend',
      description: 'Support client discovery workshops and requirement documentation.',
      responsibilities: ['Draft BRDs', 'Stakeholder interviews'],
      skills: ['Excel', 'Communication'],
      openings: 2,
      deadline: dateStr(28),
      eligibility: { minCgpa: 6.5, maxBacklogs: 1, allowedBranches: ['CSE', 'IT', 'MBA', 'MCA'], graduationYears: [2026] },
      status: 'pending',
      decision: null,
      createdAt: iso(2),
      updatedAt: iso(2)
    }
  ];
  store.db().jobs.push(...jobs);

  /* ---------------------------- applications ---------------------------- */
  function timeline(entries) {
    return entries.map(([daysAgo, status, note, byId, byRole]) => {
      const actor = users.find((u) => u.id === byId);
      return { status, note, by: byId, byName: actor.name, byRole, at: iso(daysAgo, 12) };
    });
  }

  const applications = [
    {
      id: 'app_0001',
      jobId: 'job_0001',
      studentId: 'usr_0005',
      status: 'Interview',
      note: 'Technical round scheduled.',
      resumeSnapshot: 'https://drive.google.com/resume-aarav-sharma',
      profileSnapshot: { cgpa: 8.6, branch: 'CSE', graduationYear: 2026, backlogs: 0 },
      timeline: timeline([
        [12, 'Applied', 'Application submitted by student.', 'usr_0005', 'student'],
        [10, 'Under Review', 'Screening resume against criteria.', 'usr_0002', 'recruiter'],
        [9, 'Shortlisted', 'Strong JS fundamentals — move to interviews.', 'usr_0002', 'recruiter'],
        [5, 'Interview', 'Technical round scheduled for next Tuesday, 11:00 AM.', 'usr_0002', 'recruiter']
      ]),
      createdAt: iso(12),
      updatedAt: iso(5)
    },
    {
      id: 'app_0002',
      jobId: 'job_0001',
      studentId: 'usr_0006',
      status: 'Shortlisted',
      note: '',
      resumeSnapshot: 'https://drive.google.com/resume-diya-patel',
      profileSnapshot: { cgpa: 7.2, branch: 'IT', graduationYear: 2026, backlogs: 0 },
      timeline: timeline([
        [11, 'Applied', 'Application submitted by student.', 'usr_0006', 'student'],
        [8, 'Under Review', 'Profile matches criteria.', 'usr_0002', 'recruiter'],
        [4, 'Shortlisted', '', 'usr_0002', 'recruiter']
      ]),
      createdAt: iso(11),
      updatedAt: iso(4)
    },
    {
      id: 'app_0003',
      jobId: 'job_0002',
      studentId: 'usr_0005',
      status: 'Applied',
      note: '',
      resumeSnapshot: 'https://drive.google.com/resume-aarav-sharma',
      profileSnapshot: { cgpa: 8.6, branch: 'CSE', graduationYear: 2026, backlogs: 0 },
      timeline: timeline([[3, 'Applied', 'Application submitted by student.', 'usr_0005', 'student']]),
      createdAt: iso(3),
      updatedAt: iso(3)
    },
    {
      id: 'app_0004',
      jobId: 'job_0005',
      studentId: 'usr_0006',
      status: 'Rejected',
      note: 'CGPA below the 8.0 cut-off for this drive.',
      resumeSnapshot: 'https://drive.google.com/resume-diya-patel',
      profileSnapshot: { cgpa: 7.2, branch: 'IT', graduationYear: 2026, backlogs: 0 },
      timeline: timeline([
        [9, 'Applied', 'Application submitted by student.', 'usr_0006', 'student'],
        [6, 'Rejected', 'CGPA below the 8.0 cut-off for this drive.', 'usr_0004', 'recruiter']
      ]),
      createdAt: iso(9),
      updatedAt: iso(6)
    },
    {
      id: 'app_0005',
      jobId: 'job_0005',
      studentId: 'usr_0008',
      status: 'Under Review',
      note: '',
      resumeSnapshot: 'https://drive.google.com/resume-meera-nair',
      profileSnapshot: { cgpa: 9.1, branch: 'CSE', graduationYear: 2027, backlogs: 0 },
      timeline: timeline([
        [7, 'Applied', 'Application submitted by student.', 'usr_0008', 'student'],
        [2, 'Under Review', 'Reviewing ML project portfolio.', 'usr_0004', 'recruiter']
      ]),
      createdAt: iso(7),
      updatedAt: iso(2)
    },
    {
      id: 'app_0006',
      jobId: 'job_0005',
      studentId: 'usr_0005',
      status: 'Offered',
      note: 'Offer letter sent to campus email.',
      resumeSnapshot: 'https://drive.google.com/resume-aarav-sharma',
      profileSnapshot: { cgpa: 8.6, branch: 'CSE', graduationYear: 2026, backlogs: 0 },
      timeline: timeline([
        [10, 'Applied', 'Application submitted by student.', 'usr_0005', 'student'],
        [8, 'Under Review', '', 'usr_0004', 'recruiter'],
        [6, 'Interview', 'ML case study round completed.', 'usr_0004', 'recruiter'],
        [1, 'Offered', 'Offer letter sent to campus email.', 'usr_0004', 'recruiter']
      ]),
      createdAt: iso(10),
      updatedAt: iso(1)
    }
  ];
  store.db().applications.push(...applications);

  /* -------------------------- seeded audit logs -------------------------- */
  const admin = users[0];
  store.addLog({
    action: 'company.approved',
    entityType: 'company',
    entityId: 'cmp_0001',
    entityLabel: 'TechNova Labs',
    actor: admin,
    reason: 'Verified company registration and internship policy documents.',
    meta: null
  });
  store.addLog({
    action: 'company.approved',
    entityType: 'company',
    entityId: 'cmp_0003',
    entityLabel: 'DataForge Analytics',
    actor: admin,
    reason: 'Approved after campus MoU verification.',
    meta: null
  });
  store.addLog({
    action: 'job.approved',
    entityType: 'job',
    entityId: 'job_0001',
    entityLabel: 'Software Engineer Intern — TechNova Labs',
    actor: admin,
    reason: 'Eligibility criteria verified against placement policy.',
    meta: null
  });
  store.addLog({
    action: 'job.approved',
    entityType: 'job',
    entityId: 'job_0002',
    entityLabel: 'Frontend Developer (Full-time) — TechNova Labs',
    actor: admin,
    reason: null,
    meta: null
  });
  store.addLog({
    action: 'job.approved',
    entityType: 'job',
    entityId: 'job_0005',
    entityLabel: 'Machine Learning Intern — DataForge Analytics',
    actor: admin,
    reason: 'High-CTA internship; criteria within policy limits.',
    meta: null
  });
  store.addLog({
    action: 'job.approved',
    entityType: 'job',
    entityId: 'job_0004',
    entityLabel: 'Cloud Support Engineer — TechNova Labs',
    actor: admin,
    reason: null,
    meta: null
  });
  store.addLog({
    action: 'application.status_changed',
    entityType: 'application',
    entityId: 'app_0006',
    entityLabel: 'Aarav Sharma → Machine Learning Intern',
    actor: users[3],
    reason: 'Offer letter sent to campus email.',
    meta: { from: 'Interview', to: 'Offered', batch: false },
    timestamp: iso(1)
  });

  store.save();

  if (!opts.quiet) {
    console.log('✔ Seeded data/db.json');
    console.log(`  users: ${users.length}  companies: ${companies.length}  jobs: ${jobs.length}  applications: ${applications.length}`);
    console.log('\nDemo logins:');
    console.log('  Student    aarav@student.campus.edu   / student123');
    console.log('  Recruiter  priya@technova.io          / recruiter123');
    console.log('  Admin      admin@campus.edu           / admin123');
  }
  return { users, companies, jobs, applications };
}

module.exports = { seed };

if (require.main === module) {
  seed();
}
