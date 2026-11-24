-- Reference copy. worker/db.ts creates this table automatically on first use,
-- so you do not need to run this by hand.
CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  category TEXT NOT NULL,          -- newsletter | inquiry | partnership | ecic
  form TEXT NOT NULL,              -- Contact | ECIC interest | Newsletter
  topic TEXT NOT NULL DEFAULT '',  -- enquiry type, or ECIC interests
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  organisation TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  consent INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new' -- new | handled
);
CREATE INDEX IF NOT EXISTS idx_submissions_created ON submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_category ON submissions (category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_email ON submissions (email);
