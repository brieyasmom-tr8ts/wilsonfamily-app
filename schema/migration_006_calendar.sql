-- Migration 006: Family Calendar events
-- Birthdays and anniversaries auto-populate from members table.
-- This table is for custom events (trips, school, holidays, etc.)

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  event_date TEXT NOT NULL, -- YYYY-MM-DD
  end_date TEXT,            -- YYYY-MM-DD for multi-day events
  recurring TEXT,           -- 'yearly', 'monthly', or NULL for one-time
  color TEXT DEFAULT '#2563eb',
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (created_by) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
