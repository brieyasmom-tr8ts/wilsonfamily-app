-- Migration 009: Monthly recurring pledges
CREATE TABLE IF NOT EXISTS pledges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  last_recorded_month TEXT, -- YYYY-MM of last auto-recorded contribution
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (member_id) REFERENCES members(id)
);
