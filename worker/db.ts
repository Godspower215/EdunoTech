/**
 * Form submission storage in Cloudflare D1.
 *
 * The table is created on first use, so there is no migration step to run by
 * hand. The same SQL lives in migrations/0001_submissions.sql for reference.
 */

// Minimal D1 types, so we don't need @cloudflare/workers-types.
export interface D1Result<T = Record<string, unknown>> { results: T[]; meta?: { changes?: number } }
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}

export const CATEGORIES = ['newsletter', 'inquiry', 'partnership', 'ecic'] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABELS: Record<Category, string> = {
  newsletter: 'Newsletter',
  inquiry: 'Inquiry',
  partnership: 'Partnership',
  ecic: 'ECIC',
};
export const STATUSES = ['new', 'handled'] as const;

export interface Submission {
  id: number;
  created_at: string;
  category: Category;
  form: string;
  topic: string;
  name: string;
  email: string;
  phone: string;
  organisation: string;
  subject: string;
  message: string;
  consent: number;
  status: string;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    category TEXT NOT NULL,
    form TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL,
    phone TEXT NOT NULL DEFAULT '',
    organisation TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    consent INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new'
  )`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_category ON submissions (category, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_submissions_email ON submissions (email)`,
];

let schemaReady: Promise<unknown> | null = null;
export function ensureSchema(db: D1Database) {
  if (!schemaReady) {
    schemaReady = db.batch(SCHEMA.map((s) => db.prepare(s))).catch((e) => {
      schemaReady = null; // retry on the next request
      throw e;
    });
  }
  return schemaReady;
}

export type NewSubmission = Omit<Submission, 'id' | 'created_at' | 'status'>;

/**
 * Saves a submission. Returns 'duplicate' instead of inserting when the same
 * person already signed up for the newsletter, or sent the exact same message
 * in the last 10 minutes (double clicks, resubmits, simple spam floods).
 */
export async function saveSubmission(db: D1Database, s: NewSubmission): Promise<'saved' | 'duplicate'> {
  await ensureSchema(db);
  const email = s.email.toLowerCase();
  const dupe =
    s.category === 'newsletter'
      ? await db.prepare(`SELECT id FROM submissions WHERE category = 'newsletter' AND email = ? LIMIT 1`).bind(email).first()
      : await db
          .prepare(
            `SELECT id FROM submissions WHERE email = ? AND form = ? AND message = ?
             AND created_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes') LIMIT 1`,
          )
          .bind(email, s.form, s.message)
          .first();
  if (dupe) return 'duplicate';

  await db
    .prepare(
      `INSERT INTO submissions (category, form, topic, name, email, phone, organisation, subject, message, consent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(s.category, s.form, s.topic, s.name, email, s.phone, s.organisation, s.subject, s.message, s.consent)
    .run();
  return 'saved';
}

export interface Filters {
  category?: string;
  status?: string;
  q?: string;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD, inclusive
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function where(f: Filters): { sql: string; args: unknown[] } {
  const parts: string[] = [];
  const args: unknown[] = [];
  if (f.category && (CATEGORIES as readonly string[]).includes(f.category)) {
    parts.push('category = ?');
    args.push(f.category);
  }
  if (f.status && (STATUSES as readonly string[]).includes(f.status)) {
    parts.push('status = ?');
    args.push(f.status);
  }
  if (f.from && DATE_RE.test(f.from)) {
    parts.push('created_at >= ?');
    args.push(`${f.from}T00:00:00Z`);
  }
  if (f.to && DATE_RE.test(f.to)) {
    parts.push('created_at <= ?');
    args.push(`${f.to}T23:59:59Z`);
  }
  const q = (f.q || '').trim().slice(0, 100);
  if (q) {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const cols = ['name', 'email', 'organisation', 'subject', 'message', 'topic'];
    parts.push(`(${cols.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
    args.push(...cols.map(() => like));
  }
  return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', args };
}

export async function listSubmissions(db: D1Database, f: Filters, limit: number, offset: number) {
  await ensureSchema(db);
  const w = where(f);
  const rows = await db
    .prepare(`SELECT * FROM submissions ${w.sql} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`)
    .bind(...w.args, limit, offset)
    .all<Submission>();
  const total = await db.prepare(`SELECT COUNT(*) AS n FROM submissions ${w.sql}`).bind(...w.args).first<{ n: number }>();
  // Per-category counts ignore the category filter, so the tabs always show totals.
  const wc = where({ ...f, category: undefined });
  const counts = await db
    .prepare(`SELECT category, COUNT(*) AS n, SUM(status = 'new') AS fresh FROM submissions ${wc.sql} GROUP BY category`)
    .bind(...wc.args)
    .all<{ category: string; n: number; fresh: number }>();
  return { rows: rows.results, total: total?.n ?? 0, counts: counts.results };
}

export async function allSubmissions(db: D1Database, f: Filters) {
  await ensureSchema(db);
  const w = where(f);
  const rows = await db
    .prepare(`SELECT * FROM submissions ${w.sql} ORDER BY created_at DESC, id DESC LIMIT 50000`)
    .bind(...w.args)
    .all<Submission>();
  return rows.results;
}

export async function setStatus(db: D1Database, id: number, status: string) {
  if (!(STATUSES as readonly string[]).includes(status)) throw new Error('bad status');
  await ensureSchema(db);
  const r = await db.prepare(`UPDATE submissions SET status = ? WHERE id = ?`).bind(status, id).run();
  return (r.meta?.changes ?? 0) > 0;
}

export async function deleteSubmission(db: D1Database, id: number) {
  await ensureSchema(db);
  const r = await db.prepare(`DELETE FROM submissions WHERE id = ?`).bind(id).run();
  return (r.meta?.changes ?? 0) > 0;
}
