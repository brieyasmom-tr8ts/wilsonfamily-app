-- Migration 016: Memory Verse room
-- Monthly verse with weekly activities and family progress tracking

-- The verse itself (one active per month, admin sets it)
CREATE TABLE IF NOT EXISTS memory_verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL,        -- e.g. "Philippians 4:13"
  text TEXT NOT NULL,             -- full verse text
  month TEXT NOT NULL,            -- YYYY-MM
  active INTEGER NOT NULL DEFAULT 1,
  set_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (set_by) REFERENCES members(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_verses_month ON memory_verses(month) WHERE active = 1;

-- Weekly activities for each verse
-- week 1: read-together, week 2: fill-blanks, week 3: first-letters, week 4: recite
CREATE TABLE IF NOT EXISTS verse_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verse_id INTEGER NOT NULL,
  week INTEGER NOT NULL,          -- 1-4
  type TEXT NOT NULL,             -- 'read', 'fill-blanks', 'first-letters', 'recite'
  title TEXT NOT NULL,
  description TEXT,
  FOREIGN KEY (verse_id) REFERENCES memory_verses(id) ON DELETE CASCADE
);

-- Track who completed which activity
CREATE TABLE IF NOT EXISTS verse_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verse_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  activity_id INTEGER,            -- NULL if marking verse as memorized
  completed_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(verse_id, member_id, activity_id),
  FOREIGN KEY (verse_id) REFERENCES memory_verses(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id),
  FOREIGN KEY (activity_id) REFERENCES verse_activities(id) ON DELETE CASCADE
);

-- Recordings of people reciting the verse from memory
CREATE TABLE IF NOT EXISTS verse_recordings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verse_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  media_url TEXT NOT NULL,        -- R2 URL
  media_type TEXT NOT NULL DEFAULT 'video', -- 'video' or 'audio'
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (verse_id) REFERENCES memory_verses(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_verse_progress_verse ON verse_progress(verse_id);
CREATE INDEX IF NOT EXISTS idx_verse_recordings_verse ON verse_recordings(verse_id);
