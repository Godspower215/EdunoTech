/**
 * Private submissions dashboard at /dashboard (the CMS keeps /admin).
 *
 *   GET    /dashboard                       the dashboard page
 *   GET    /dashboard/app.js                its script
 *   GET    /dashboard/api/submissions       JSON list (filters: category, status, q, from, to, page)
 *   GET    /dashboard/api/export.csv        CSV download with the same filters
 *   PATCH  /dashboard/api/submissions/:id   { status: "new" | "handled" }
 *   DELETE /dashboard/api/submissions/:id   permanent delete (for data deletion requests)
 *
 *   GET    /dashboard/login                 password sign-in page (password mode)
 *   POST   /dashboard/login                 checks the password, sets the session cookie
 *   POST   /dashboard/logout                signs out
 *
 * Login, in order of preference:
 *   1. Cloudflare Access, if ACCESS_TEAM_DOMAIN and ACCESS_AUD are set (see access.ts).
 *   2. Otherwise a password in the Worker secret ADMIN_PASSWORD (see password.ts).
 *   3. If neither is set, the dashboard stays locked.
 */
import { verifyAccess, type AccessEnv } from './access';
import { clearCookie, handleLogin, hasSession, loginPage, passwordConfigured, type PasswordEnv } from './password';
import {
  CATEGORY_LABELS,
  allSubmissions,
  deleteSubmission,
  listSubmissions,
  setStatus,
  type D1Database,
  type Filters,
  type Submission,
} from './db';
import { DASHBOARD_HTML, DASHBOARD_JS } from './dashboard-ui';

export interface AdminEnv extends AccessEnv, PasswordEnv {
  DB?: D1Database;
}

type Auth = { ok: true; email: string } | { ok: false; response: Response };

async function authenticate(request: Request, env: AdminEnv, path: string): Promise<Auth> {
  const isApi = path.startsWith('/dashboard/api/');
  if (env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD) {
    const a = await verifyAccess(request, env);
    if (a.ok) return a;
    return {
      ok: false,
      response: isApi
        ? json({ ok: false, error: 'Please sign in again.' }, a.status)
        : page('Sign-in required', 'Please open this page on the main website address so Cloudflare Access can ask you to sign in.', a.status),
    };
  }
  if (passwordConfigured(env)) {
    if (await hasSession(request, env)) return { ok: true, email: '' };
    return {
      ok: false,
      response: isApi
        ? json({ ok: false, error: 'Your session has ended. Please refresh the page and sign in again.' }, 401)
        : new Response(null, { status: 303, headers: { Location: '/dashboard/login', 'Cache-Control': 'no-store' } }),
    };
  }
  return { ok: false, response: page('Dashboard not switched on yet', 'No dashboard password has been set for this site yet, so the dashboard stays locked.', 503) };
}

const PAGE_SIZE = 50;

const baseHeaders = {
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...baseHeaders, 'Content-Type': 'application/json' } });

const page = (title: string, text: string, status: number) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<body style="font-family:system-ui,sans-serif;max-width:40rem;margin:4rem auto;padding:0 1rem;color:#123b2a">` +
      `<h1 style="font-size:1.4rem">${title}</h1><p>${text}</p></body>`,
    { status, headers: { ...baseHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
  );

function filtersFrom(url: URL): Filters {
  const p = url.searchParams;
  return {
    category: p.get('category') || undefined,
    status: p.get('status') || undefined,
    q: p.get('q') || undefined,
    from: p.get('from') || undefined,
    to: p.get('to') || undefined,
  };
}

/** Spreadsheet-safe CSV cell: quotes, and neutralises formulas (=, +, -, @). */
function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(rows: Submission[]): string {
  const cols: [string, (r: Submission) => unknown][] = [
    ['Date (UTC)', (r) => r.created_at.replace('T', ' ').replace('Z', '')],
    ['Category', (r) => CATEGORY_LABELS[r.category] || r.category],
    ['Form', (r) => r.form],
    ['Type / interests', (r) => r.topic],
    ['Name', (r) => r.name],
    ['Email', (r) => r.email],
    ['Phone', (r) => r.phone],
    ['Organisation', (r) => r.organisation],
    ['Subject', (r) => r.subject],
    ['Message', (r) => r.message],
    ['Consent', (r) => (r.consent ? 'Yes' : 'No')],
    ['Status', (r) => r.status],
    ['ID', (r) => r.id],
  ];
  const lines = [cols.map(([h]) => csvCell(h)).join(',')];
  for (const r of rows) lines.push(cols.map(([, f]) => csvCell(f(r))).join(','));
  // BOM so Excel opens it as UTF-8 (names with accents, ₦, etc.).
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export async function handleDashboard(request: Request, env: AdminEnv): Promise<Response> {
  const url = new URL(request.url);

  const path = url.pathname.replace(/\/+$/, '') || '/dashboard';
  const accessMode = Boolean(env.ACCESS_TEAM_DOMAIN && env.ACCESS_AUD);

  if (path === '/dashboard/logout' && request.method === 'POST') {
    const to = accessMode ? '/cdn-cgi/access/logout' : '/dashboard/login';
    return new Response(null, { status: 303, headers: { Location: to, 'Set-Cookie': clearCookie, 'Cache-Control': 'no-store' } });
  }
  if (path === '/dashboard/login' && !accessMode && passwordConfigured(env)) {
    if (request.method === 'POST') return handleLogin(request, env);
    if (await hasSession(request, env)) return new Response(null, { status: 303, headers: { Location: '/dashboard' } });
    return loginPage();
  }

  const authResult = await authenticate(request, env, path);
  if (!authResult.ok) return authResult.response;
  const auth = authResult;

  if (path === '/dashboard' && request.method === 'GET') {
    return new Response(DASHBOARD_HTML, {
      headers: {
        ...baseHeaders,
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy':
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      },
    });
  }
  if (path === '/dashboard/app.js' && request.method === 'GET') {
    return new Response(DASHBOARD_JS, { headers: { ...baseHeaders, 'Content-Type': 'text/javascript; charset=utf-8' } });
  }

  if (!path.startsWith('/dashboard/api/')) return page('Not found', 'There is nothing at this address.', 404);
  if (!env.DB) return json({ ok: false, error: 'The database is not connected yet (missing DB binding).' }, 503);

  // Changes must come from the dashboard itself (blocks cross-site requests).
  if (request.method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (!origin || origin !== url.origin || request.headers.get('X-Requested-With') !== 'dashboard') {
      return json({ ok: false, error: 'Request not allowed.' }, 403);
    }
  }

  try {
    if (path === '/dashboard/api/me' && request.method === 'GET') {
      return json({ ok: true, email: auth.email });
    }

    if (path === '/dashboard/api/submissions' && request.method === 'GET') {
      const pageNo = Math.max(1, Math.min(10_000, Number(url.searchParams.get('page')) || 1));
      const data = await listSubmissions(env.DB, filtersFrom(url), PAGE_SIZE, (pageNo - 1) * PAGE_SIZE);
      return json({ ok: true, page: pageNo, pageSize: PAGE_SIZE, email: auth.email, ...data });
    }

    if (path === '/dashboard/api/export.csv' && request.method === 'GET') {
      const f = filtersFrom(url);
      const rows = await allSubmissions(env.DB, f);
      const stamp = new Date().toISOString().slice(0, 10);
      const name = `edunotech-${f.category && f.category in CATEGORY_LABELS ? f.category : 'all'}-submissions-${stamp}.csv`;
      return new Response(toCsv(rows), {
        headers: { ...baseHeaders, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` },
      });
    }

    const m = path.match(/^\/dashboard\/api\/submissions\/(\d+)$/);
    if (m) {
      const id = Number(m[1]);
      if (request.method === 'PATCH') {
        const body = (await request.json().catch(() => ({}))) as { status?: string };
        const ok = await setStatus(env.DB, id, String(body.status || ''));
        return ok ? json({ ok: true }) : json({ ok: false, error: 'Not found.' }, 404);
      }
      if (request.method === 'DELETE') {
        const ok = await deleteSubmission(env.DB, id);
        return ok ? json({ ok: true }) : json({ ok: false, error: 'Not found.' }, 404);
      }
    }
    return json({ ok: false, error: 'Not found.' }, 404);
  } catch (e) {
    console.error('dashboard error', e);
    return json({ ok: false, error: 'Something went wrong reading the database.' }, 500);
  }
}
