-- Migration 005: Rocks of Remembrance
-- Each rock has a word/phrase and a story behind it (text, audio, or video)

CREATE TABLE IF NOT EXISTS rocks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word TEXT NOT NULL,
  story TEXT,
  media_type TEXT, -- 'text', 'audio', 'video', or NULL
  media_url TEXT,  -- external URL for audio/video (YouTube, etc.)
  color TEXT NOT NULL DEFAULT '#64748b', -- display color for the rock
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (created_by) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_rocks_created ON rocks(created_at);
