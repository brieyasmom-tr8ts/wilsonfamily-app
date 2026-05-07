-- Migration 010: Prayer & Praise Wall

CREATE TABLE IF NOT EXISTS prayers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'prayer', -- 'prayer' or 'praise'
  answered INTEGER NOT NULL DEFAULT 0,
  answered_note TEXT,
  posted_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (posted_by) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS prayer_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  prayer_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(prayer_id, member_id),
  FOREIGN KEY (prayer_id) REFERENCES prayers(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_prayers_date ON prayers(created_at);
CREATE INDEX IF NOT EXISTS idx_prayer_responses_prayer ON prayer_responses(prayer_id);
