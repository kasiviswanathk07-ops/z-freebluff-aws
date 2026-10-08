'use strict';
/** Shared UI helpers: escaping, formatting, badges, toasts, modals, app bar. */

export function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value.length === 10 ? value + 'T00:00:00' : value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function daysLeft(deadline) {
  if (!deadline) return null;
  const end = new Date(deadline + 'T23:59:59');
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end.getTime() - Date.now()) / 86400000);
}

export function initials(name) {
  return String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

/* ------------------------------ badges ------------------------------ */

const VARIANTS = {
  approved: 'b-green',
  Offered: 'b-green',
  eligible: 'b-green',
  pending: 'b-amber',
  'Under Review': 'b-amber',
  rejected: 'b-red',
  Rejected: 'b-red',
  closed: 'b-gray',
  Withdrawn: 'b-gray',
  Applied: 'b-blue',
  Interview: 'b-blue',
  Shortlisted: 'b-purple',
  Internship: 'b-blue',
  'Full-time': 'b-purple'
};

export function badge(status) {
  const label = String(status ?? '—');
  const variant = VARIANTS[label] || 'b-gray';
  return `<span class="badge ${variant}">${esc(label)}</span>`;
}

/* ------------------------------ toasts ------------------------------ */

function toastWrap() {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  return wrap;
}

export function toast(message, type = 'success', ms = 3600) {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = esc(message);
  toastWrap().appendChild(el);
  setTimeout(() => el.remove(), ms);
}

export function errorMessage(err) {
  if (err && err.data && Array.isArray(err.data.blockers) && err.data.blockers.length) {
    return `${err.message} ${err.data.blockers.join(' ')}`;
  }
  return (err && err.message) || 'Something went wrong.';
}

/* ------------------------------ modals ------------------------------ */

export function modal({ title, body, footer = '', width = 640 }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:${width}px" role="dialog" aria-modal="true">
      <div class="modal-head">
        <h2>${esc(title)}</h2>
        <button class="modal-x" aria-label="Close">×</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  overlay.querySelector('.modal-x').addEventListener('click', close);
  document.body.appendChild(overlay);
  return { overlay, close };
}

export function confirmModal({ title, message, confirmText = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    const { overlay, close } = modal({
      title,
      body: `<p>${esc(message)}</p>`,
      footer: `<button class="btn" data-no>Cancel</button>
               <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(confirmText)}</button>`
    });
    overlay.querySelector('[data-no]').addEventListener('click', () => { close(); resolve(false); });
    overlay.querySelector('[data-yes]').addEventListener('click', () => { close(); resolve(true); });
  });
}

/* ------------------------------ app bar ------------------------------ */

const NAV = {
  student: [
    ['/student/dashboard.html', 'Dashboard'],
    ['/student/jobs.html', 'Browse Jobs'],
    ['/student/applications.html', 'My Applications'],
    ['/student/profile.html', 'Profile']
  ],
  recruiter: [
    ['/recruiter/dashboard.html', 'Dashboard'],
    ['/recruiter/company.html', 'My Company'],
    ['/recruiter/jobs.html', 'Job Postings'],
    ['/recruiter/applicants.html', 'Applicants']
  ],
  admin: [
    ['/admin/dashboard.html', 'Dashboard'],
    ['/admin/companies.html', 'Company Approvals'],
    ['/admin/jobs.html', 'Job Approvals'],
    ['/admin/logs.html', 'Audit Logs']
  ]
};

const ROLE_LABEL = { student: 'Student Applicant', recruiter: 'Company Recruiter', admin: 'Placement Cell Admin' };

/**
 * Renders the top app bar for the signed-in user.
 * @param {object} s session ({user, company}) from guard()/session()
 * @param {string} active href of the active nav link
 */
export function mountAppbar(s, active) {
  const header = document.getElementById('appbar');
  if (!header || !s || !s.user) return;
  const links = (NAV[s.user.role] || [])
    .map(([href, label]) => `<a href="${href}" class="${href === active ? 'active' : ''}">${esc(label)}</a>`)
    .join('');
  const sub = s.user.role === 'recruiter' && s.company ? esc(s.company.name) : ROLE_LABEL[s.user.role] || s.user.role;
  header.innerHTML = `
    <div class="appbar-inner">
      <a class="brand" href="/"><span class="brand-dot">CC</span>CampusConnect</a>
      <nav class="nav">${links}</nav>
      <div class="appbar-right">
        <span class="user-chip">
          <span class="txt"><b>${esc(s.user.name)}</b><small>${esc(sub)}</small></span>
          <span class="avatar">${esc(initials(s.user.name))}</span>
        </span>
        <button class="btn ghost sm" id="navLogout">Logout</button>
      </div>
    </div>`;
  header.querySelector('#navLogout').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.href = '/';
  });
}

export function mountFooter() {
  const footer = document.getElementById('footer');
  if (footer) {
    footer.innerHTML = `<span>CampusConnect — Campus Placement & Internship Portal (demo)</span>
      <span>HTML · CSS · JavaScript · Node/Express</span>`;
  }
}
