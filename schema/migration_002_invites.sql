-- Migration 002 — Add invites table for personalized family invitations
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  name TEXT NOT NULL, -- pre-filled name (recipient can change on welcome)
  role TEXT NOT NULL DEFAULT 'member', -- 'parent' or 'member'
  invited_by INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  accepted_at INTEGER, -- when they completed the welcome flow
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (invited_by) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_invites_token ON invites(token);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
