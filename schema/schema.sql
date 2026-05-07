-- Wilson Family — D1 Schema
-- Stage 1: Foundation (auth + generosity fund)

-- Family members (no passwords - magic link auth)
CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'parent' or 'member'
  avatar_emoji TEXT DEFAULT '🌱',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Magic link tokens (short-lived, single-use)
CREATE TABLE IF NOT EXISTS magic_tokens (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  next_path TEXT DEFAULT '/'
);

-- Sessions (after magic link is consumed)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  member_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

-- ===========  GENEROSITY FUND  ===========

-- The pot - every dollar in or out gets a row
CREATE TABLE IF NOT EXISTS contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'one-time', -- 'monthly-allocation', 'one-time', 'kid-contribution'
  note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

-- Suggestions for who to be generous to
CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggested_by INTEGER NOT NULL,
  recipient_name TEXT NOT NULL,
  story TEXT NOT NULL,
  scripture TEXT,
  suggested_amount_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'approved', 'declined', 'disbursed'
  parent_decision_by INTEGER,
  parent_decision_at INTEGER,
  parent_decision_note TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (suggested_by) REFERENCES members(id),
  FOREIGN KEY (parent_decision_by) REFERENCES members(id)
);

-- Votes - one per member per suggestion
CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  vote TEXT NOT NULL DEFAULT 'yes',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(suggestion_id, member_id),
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

-- Disbursements - when money actually went out
CREATE TABLE IF NOT EXISTS disbursements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id INTEGER NOT NULL UNIQUE,
  amount_cents INTEGER NOT NULL,
  method TEXT,
  method_note TEXT,
  disbursed_at INTEGER NOT NULL,
  recorded_by INTEGER NOT NULL,
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id),
  FOREIGN KEY (recorded_by) REFERENCES members(id)
);

-- Story archive - reception updates from recipients
CREATE TABLE IF NOT EXISTS receptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id INTEGER NOT NULL,
  added_by INTEGER NOT NULL,
  content TEXT NOT NULL,
  image_r2_key TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id),
  FOREIGN KEY (added_by) REFERENCES members(id)
);

-- Reflections - "what God did through this"
CREATE TABLE IF NOT EXISTS reflections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id INTEGER NOT NULL,
  member_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (suggestion_id) REFERENCES suggestions(id),
  FOREIGN KEY (member_id) REFERENCES members(id)
);

-- Invites - personalized family invitations
CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (invited_by) REFERENCES members(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contributions_member ON contributions(member_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status);
CREATE INDEX IF NOT EXISTS idx_votes_suggestion ON votes(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_magic_tokens_expires ON magic_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
