/**
 * Password login for /dashboard (no Cloudflare Access / no card needed).
 *
 * The password lives only in a Worker secret called ADMIN_PASSWORD
 * (Workers > edunotech > Settings > Variables and Secrets > type "Secret").
 * After a correct password the browser gets a signed, HttpOnly cookie for
 * 12 hours, scoped to /dashboard. Changing the secret signs everyone out.
 * Failed attempts are limited per visitor (10 per 15 minutes) using D1.
 */
import type { D1Database } from './db';

export interface PasswordEnv {
  ADMIN_PASSWORD?: string;
  DB?: D1Database;
}

const COOKIE = 'edn_dash';
const SESSION_SECONDS = 12 * 60 * 60;
const MAX_FAILS = 10;
const WINDOW_MINUTES = 15;

const enc = new TextEncoder();

async function hmacKey(password: string) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`edunotech-dashboard-session:${password}`));
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

const toHex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex: string) => new Uint8Array((hex.match(/../g) || []).map((h) => parseInt(h, 16)));

export function passwordConfigured(env: PasswordEnv) {
  return Boolean(env.ADMIN_PASSWORD && env.ADMIN_PASSWORD.length >= 12);
}

function readCookie(req: Request, name: string) {
  const c = req.headers.get('Cookie') || '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : '';
}

/** True when the request carries a valid, unexpired session cookie. */
export async function hasSession(req: Request, env: PasswordEnv): Promise<boolean> {
  if (!passwordConfigured(env)) return false;
  const [exp, sig] = readCookie(req, COOKIE).split('.');
  if (!exp || !sig || !/^\d+$/.test(exp) || Number(exp) < Date.now() / 1000) return false;
  const key = await hmacKey(env.ADMIN_PASSWORD!);
  return crypto.subtle.verify('HMAC', key, fromHex(sig), enc.encode(exp));
}

async function sessionCookie(env: PasswordEnv) {
  const exp = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
  const sig = toHex(await crypto.subtle.sign('HMAC', await hmacKey(env.ADMIN_PASSWORD!), enc.encode(exp)));
  return `${COOKIE}=${exp}.${sig}; Path=/dashboard; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

export const clearCookie = `${COOKIE}=; Path=/dashboard; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

/** Constant-time password comparison (compares HMACs of both values). */
async function samePassword(given: string, real: string) {
  const key = await crypto.subtle.importKey('raw', crypto.getRandomValues(new Uint8Array(32)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const [a, b] = await Promise.all([crypto.subtle.sign('HMAC', key, enc.encode(given)), crypto.subtle.sign('HMAC', key, enc.encode(real))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function visitorId(req: Request) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(`login:${ip}`))).slice(0, 32);
}

async function tooManyFails(db: D1Database | undefined, who: string) {
  if (!db) return false;
  await db.prepare(`CREATE TABLE IF NOT EXISTS login_failures (who TEXT NOT NULL, at TEXT NOT NULL)`).run();
  await db.prepare(`DELETE FROM login_failures WHERE at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')`).run();
  const r = await db
    .prepare(`SELECT COUNT(*) AS n FROM login_failures WHERE who = ? AND at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?)`)
    .bind(who, `-${WINDOW_MINUTES} minutes`)
    .first<{ n: number }>();
  return (r?.n ?? 0) >= MAX_FAILS;
}

async function recordFail(db: D1Database | undefined, who: string) {
  if (!db) return;
  await db.prepare(`INSERT INTO login_failures (who, at) VALUES (?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`).bind(who).run();
}

const pageHeaders = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

export function loginPage(message = '', status = 200) {
  const note = message ? `<p class="err" role="alert">${message}</p>` : '';
  return new Response(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>Sign in · Edunotech Submissions</title><link rel="icon" href="/favicon-48.png">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f7f4;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#14231b;padding:16px}
main{width:100%;max-width:24rem;background:#fff;border:1px solid #dfe6e0;border-radius:14px;padding:1.75rem}
h1{font-size:1.25rem;margin:0 0 .25rem;color:#123b2a}p{margin:0 0 1.25rem;color:#5b6b62;font-size:.95rem}
label{display:block;font-weight:650;font-size:.9rem;margin-bottom:.35rem}
input{width:100%;font:inherit;padding:.7rem .8rem;border:1.5px solid #c9d3cb;border-radius:8px}
input:focus{outline:none;border-color:#16834a;box-shadow:0 0 0 3px rgba(22,131,74,.2)}
button{margin-top:1rem;width:100%;font:inherit;font-weight:700;padding:.75rem;border:0;border-radius:8px;background:#16834a;color:#fff;cursor:pointer}
button:hover{background:#123b2a}.err{color:#b42318;background:#fef3f2;border:1px solid #f5c2bd;border-radius:8px;padding:.6rem .8rem}
</style></head><body><main>
<h1>Edunotech Submissions</h1><p>Private area. Enter the dashboard password.</p>${note}
<form method="post" action="/dashboard/login"><label for="pw">Password</label>
<input id="pw" name="password" type="password" autocomplete="current-password" required autofocus>
<button type="submit">Sign in</button></form></main></body></html>`,
    { status, headers: pageHeaders },
  );
}

/** Handles POST /dashboard/login. */
export async function handleLogin(req: Request, env: PasswordEnv): Promise<Response> {
  const url = new URL(req.url);
  const origin = req.headers.get('Origin');
  if (origin && origin !== url.origin) return loginPage('Request not allowed.', 403);

  const who = await visitorId(req);
  if (await tooManyFails(env.DB, who)) {
    return loginPage(`Too many wrong attempts. Please wait ${WINDOW_MINUTES} minutes and try again.`, 429);
  }
  const form = await req.formData().catch(() => null);
  const given = String(form?.get('password') || '').slice(0, 200);
  if (!given || !(await samePassword(given, env.ADMIN_PASSWORD!))) {
    await recordFail(env.DB, who);
    return loginPage('That password is not right.', 401);
  }
  return new Response(null, { status: 303, headers: { Location: '/dashboard', 'Set-Cookie': await sessionCookie(env), 'Cache-Control': 'no-store' } });
}
