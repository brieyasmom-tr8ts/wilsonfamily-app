-- Migration 017: Verse game scores
-- Track times/scores for practice games

CREATE TABLE IF NOT EXISTS verse_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  verse_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  game_type TEXT NOT NULL,       -- 'scramble', 'erase', 'speed', 'typeit'
  score_ms INTEGER,              -- time in milliseconds (scramble, speed)
  score_pct INTEGER,             -- accuracy percentage (typeit)
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (verse_id) REFERENCES memory_verses(id) ON DELETE CASCADE,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_verse_scores_verse ON verse_scores(verse_id, game_type);
CREATE INDEX IF NOT EXISTS idx_verse_scores_member ON verse_scores(member_id);
