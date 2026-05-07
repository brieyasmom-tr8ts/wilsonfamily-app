-- Migration 007: Add deadline to suggestions
ALTER TABLE suggestions ADD COLUMN decision_needed_by TEXT; -- YYYY-MM-DD
