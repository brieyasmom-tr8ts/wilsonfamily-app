-- Migration 015: List sharing via public link
-- Adds a share token so lists can be viewed without auth

ALTER TABLE lists ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_lists_share_token ON lists(share_token) WHERE share_token IS NOT NULL;
