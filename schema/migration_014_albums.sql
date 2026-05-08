-- Migration 014: Scrapbook albums
-- Group photos into albums (events, trips, holidays)

CREATE TABLE IF NOT EXISTS albums (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  cover_photo_id INTEGER,
  created_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES members(id)
);

ALTER TABLE photos ADD COLUMN album_id INTEGER REFERENCES albums(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_photos_album ON photos(album_id);
