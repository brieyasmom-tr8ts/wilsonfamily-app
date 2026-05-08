-- Migration 012: Lists & Wishes

CREATE TABLE IF NOT EXISTS lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  has_checkboxes INTEGER NOT NULL DEFAULT 1,
  allow_others_add INTEGER NOT NULL DEFAULT 0,
  visibility TEXT NOT NULL DEFAULT 'everyone', -- 'everyone', 'only', 'hide_from'
  visibility_members TEXT, -- comma-separated member IDs for 'only' or 'hide_from'
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (owner_id) REFERENCES members(id)
);

CREATE TABLE IF NOT EXISTS list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  checked INTEGER NOT NULL DEFAULT 0,
  added_by INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (list_id) REFERENCES lists(id) ON DELETE CASCADE,
  FOREIGN KEY (added_by) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_lists_owner ON lists(owner_id);
CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_id);
