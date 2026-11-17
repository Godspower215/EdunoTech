/**
 * Cloudflare Pages Function: POST /api/submit
 *
 * Receives the Contact and ECIC-interest forms, validates and sanitises them,
 * checks spam protection, and emails the submission to the approved company
 * address using Resend (https://resend.com).
 *
 * Required environment variables (Cloudflare Pages > Settings > Variables and Secrets):
 *   RESEND_API_KEY        secret   API key from Resend
 *   MAIL_FROM             text     e.g. "Edunotech Website <website@yourdomain.com>" (domain verified in Resend)
 *   MAIL_TO               text     approved company inbox for general enquiries
 * Optional:
 *   MAIL_TO_ECIC          text     separate inbox for ECIC interest (defaults to MAIL_TO)
 *   TURNSTILE_SECRET_KEY  secret   enables Cloudflare Turnstile verification
 *   ALLOWED_ORIGINS       text     comma-separated origins allowed to post (defaults to same origin)
 *
 * Nothing secret ever reaches the browser. Until the variables are set, the
 * endpoint answers 503 so the form shows an honest error instead of
 * pretending to send.
 */

interface Env {
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  MAIL_TO?: string;
  MAIL_TO_ECIC?: string;
  TURNSTILE_SECRET_KEY?: string;
  ALLOWED_ORIGINS?: string;
}

const ENQUIRY_LABELS: Record<string, string> = {
  general: 'General Enquiry',
  web: 'Website and Digital Solutions',
  ai: 'AI and Technology Solutions',
  education: 'Education and Training',
  partnership: 'Institutional Partnership',
  pse: 'The Problem-Solving Experience',
  'ecic-sponsor': 'ECIC Sponsorship or Partnership',
  'ecic-participation': 'ECIC Participation',
  other: 'Other',
};

const ECIC_INTERESTS = new Set([
  'Institution participation',
  'Innovator or student participation',
  'Mentorship',
  'Volunteering',
  'Planning and organising',
  'Sponsorship',
  'Institutional partnership',
  'Media and communications',
  'Other support',
]);

const EMAIL_RE = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;
const PHONE_RE = /^[0-9+()\-\s]{6,40}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/** Trim, strip control characters and cap length. */
const clean = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max) : '';

/** Single-line values (used in email headers/subjects) must not contain newlines. */
const oneLine = (v: string) => v.replace(/[\r\n]+/g, ' ');

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

async function verifyTurnstile(secret: string, token: string, ip: string | null) {
  const body = new FormData();
  body.append('secret', secret);
  body.append('response', token);
  if (ip) body.append('remoteip', ip);
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  const data = (await r.json()) as { success?: boolean };
  return Boolean(data.success);
}

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  // Same-origin check (basic CSRF / abuse protection).
  const origin = request.headers.get('Origin');
  const self = new URL(request.url).origin;
  const allowed = new Set([self, ...(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean)]);
  if (origin && !allowed.has(origin)) return json({ ok: false, error: 'Request not allowed.' }, 403);

  if (!(request.headers.get('Content-Type') || '').includes('application/json')) {
    return json({ ok: false, error: 'Unsupported request.' }, 415);
  }
  const raw = await request.text();
  if (raw.length > 20_000) return json({ ok: false, error: 'Submission is too large.' }, 413);

  let input: Record<string, unknown>;
  try {
    input = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'Invalid submission.' }, 400);
  }

  // Honeypot and too-fast submissions: pretend success so bots learn nothing.
  if (clean(input.company_website, 200) || Number(input.elapsedMs) < 1500) {
    return json({ ok: true });
  }

  const formType = input.formType === 'ecic-interest' ? 'ecic-interest' : 'contact';
  const name = oneLine(clean(input.name, 120));
  const email = oneLine(clean(input.email, 200));
  const organisation = oneLine(clean(input.organisation, 200));
  const phone = oneLine(clean(input.phone, 40));
  const message = clean(input.message, 5000);
  const consent = input.consent === 'yes';

  const errors: string[] = [];
  if (!name) errors.push('name');
  if (!EMAIL_RE.test(email)) errors.push('email');
  if (phone && !PHONE_RE.test(phone)) errors.push('phone');
  if (message.length < 10) errors.push('message');
  if (!consent) errors.push('consent');

  let subject = '';
  let enquiryLabel = '';
  let interests: string[] = [];
  if (formType === 'contact') {
    const t = clean(input.enquiryType, 40);
    enquiryLabel = ENQUIRY_LABELS[t] || '';
    subject = oneLine(clean(input.subject, 200));
    if (!enquiryLabel) errors.push('enquiryType');
    if (!subject) errors.push('subject');
  } else {
    const list = Array.isArray(input.interests) ? input.interests : [input.interests];
    interests = list.map((v) => clean(v, 80)).filter((v) => ECIC_INTERESTS.has(v));
    if (!interests.length) errors.push('interests');
  }
  if (errors.length) return json({ ok: false, error: 'Some fields are missing or invalid.', fields: errors }, 422);

  // Turnstile (enabled once the secret is configured).
  if (env.TURNSTILE_SECRET_KEY) {
    const token = clean(input['cf-turnstile-response'], 4096);
    const ok = token && (await verifyTurnstile(env.TURNSTILE_SECRET_KEY, token, request.headers.get('CF-Connecting-IP')));
    if (!ok) return json({ ok: false, error: 'Spam check failed. Please refresh the page.' }, 400);
  }

  if (!env.RESEND_API_KEY || !env.MAIL_FROM || !env.MAIL_TO) {
    return json({ ok: false, error: 'The form is not connected to an inbox yet.' }, 503);
  }

  const to = formType === 'ecic-interest' ? env.MAIL_TO_ECIC || env.MAIL_TO : env.MAIL_TO;
  const tag = formType === 'ecic-interest' ? '[ECIC 2027 Interest]' : `[Website Enquiry: ${enquiryLabel}]`;
  const emailSubject = formType === 'ecic-interest' ? `${tag} ${name}` : `${tag} ${subject}`;

  const rows: [string, string][] = [
    ['Form', formType === 'ecic-interest' ? 'ECIC 2027 interest' : 'Contact'],
    ...(enquiryLabel ? ([['Nature of enquiry', enquiryLabel]] as [string, string][]) : []),
    ...(interests.length ? ([['Interested in', interests.join(', ')]] as [string, string][]) : []),
    ['Name', name],
    ['Email', email],
    ['Organisation', organisation || '(not given)'],
    ['Phone', phone || '(not given)'],
    ...(subject ? ([['Subject', subject]] as [string, string][]) : []),
    ['Privacy consent', 'Yes'],
    ['Received', new Date().toISOString()],
  ];

  const text = `${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nMessage:\n${message}\n`;
  const html = `<table cellpadding="6" style="border-collapse:collapse;font-family:sans-serif;font-size:14px">${rows
    .map(([k, v]) => `<tr><th align="left" style="color:#123B2A">${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join('')}</table><p style="font-family:sans-serif;font-size:14px;white-space:pre-wrap">${esc(message)}</p>`;

  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], reply_to: email, subject: emailSubject, text, html }),
  });

  if (!r.ok) {
    console.error('Resend error', r.status, await r.text().catch(() => ''));
    return json({ ok: false, error: 'We could not send your message right now.' }, 502);
  }
  return json({ ok: true });
};

