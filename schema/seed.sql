-- Seed the parents only. Everyone else gets invited from inside the app.
-- Edit the emails to your real ones before running.

INSERT INTO members (name, email, role, avatar_emoji) VALUES
  ('Heather', 'YOUR_EMAIL@example.com', 'parent', '✨'),
  ('Dan',     'DANS_EMAIL@example.com', 'parent', '🛡️');
