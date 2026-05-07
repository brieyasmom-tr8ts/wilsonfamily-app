-- Migration 008: Scrapbook — photos with captions and people tags

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  r2_key TEXT NOT NULL,
  caption TEXT,
  taken_date TEXT, -- YYYY-MM-DD optional
  uploaded_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (uploaded_by) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS photo_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  photo_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  UNIQUE(photo_id, member_id),
  FOREIGN KEY (photo_id) REFERENCES photos(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_photos_date ON photos(created_at);
CREATE INDEX IF NOT EXISTS idx_photo_tags_member ON photo_tags(member_id);
CREATE INDEX IF NOT EXISTS idx_photo_tags_photo ON photo_tags(photo_id);
