-- Migration 003: Kid PIN login
-- Adds PIN-based auth for kids without email addresses

-- Allow members without email (kids use PIN instead)
-- SQLite doesn't support ALTER COLUMN, so we add pin_hash alongside existing columns
ALTER TABLE members ADD COLUMN pin_hash TEXT;

-- Track failed PIN attempts for rate limiting
CREATE TABLE IF NOT EXISTS pin_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  attempted_at INTEGER NOT NULL DEFAULT (unixepoch()),
  success INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_pin_attempts_member ON pin_attempts(member_id, attempted_at);
