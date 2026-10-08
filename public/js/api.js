'use strict';
/** Shared API client + session guard for the multi-page frontend. */

export async function api(path, { method = 'GET', body, query } = {}) {
  const url = new URL(path, location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON response */
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

let sessionCache = null;

export async function session(force = false) {
  if (sessionCache && !force) return sessionCache;
  try {
    sessionCache = await api('/api/auth/me');
  } catch (err) {
    sessionCache = null;
    throw err;
  }
  return sessionCache;
}

export function dashboardFor(role) {
  return { student: '/student/dashboard.html', recruiter: '/recruiter/dashboard.html', admin: '/admin/dashboard.html' }[role] || '/';
}

/**
 * Page guard: redirect anonymous visitors to login and users with the wrong
 * role to their own dashboard. Returns the session, or null if redirected.
 */
export async function guard(role) {
  let s;
  try {
    s = await session();
  } catch {
    const next = encodeURIComponent(location.pathname + location.search);
    location.href = `/?next=${next}`;
    return null;
  }
  if (role && s.user.role !== role) {
    location.href = dashboardFor(s.user.role);
    return null;
  }
  return s;
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* ignore */
  }
  location.href = '/';
}

/** Read a query-string parameter. */
export function param(name) {
  return new URLSearchParams(location.search).get(name);
}
