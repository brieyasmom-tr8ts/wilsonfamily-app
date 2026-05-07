-- Migration 004: User profiles + admin role
-- Adds username, birthday, anniversary for profile setup

ALTER TABLE members ADD COLUMN username TEXT;
ALTER TABLE members ADD COLUMN birthday TEXT;
ALTER TABLE members ADD COLUMN anniversary TEXT;
ALTER TABLE members ADD COLUMN profile_complete INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_members_username ON members(username) WHERE username IS NOT NULL;
