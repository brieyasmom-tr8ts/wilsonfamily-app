// GET    /api/verses          — get current month's verse + progress + recordings
// GET    /api/verses?all=1    — get all verses (archive)
// POST   /api/verses          — set this month's verse (admin only)
// PUT    /api/verses          — mark activity complete or record memorized
// DELETE /api/verses          — delete a verse (admin only)

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

const WEEKLY_ACTIVITIES = [
  { week: 1, type: 'read', title: 'Read It', description: 'Read the verse out loud. Say it three times to yourself.' },
  { week: 2, type: 'fill-blanks', title: 'Fill in the Blanks', description: 'Can you fill in the missing words?' },
  { week: 3, type: 'first-letters', title: 'First Letter Hints', description: 'Only the first letter of each word is shown. Can you say it?' },
  { week: 4, type: 'recite', title: 'Say It From Memory', description: 'No hints! Record yourself saying the verse from memory.' },
];

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const url = new URL(request.url);
  const showAll = url.searchParams.get('all') === '1';

  if (showAll) {
    const verses = await env.DB.prepare(`
      SELECT v.id, v.reference, v.text, v.month, v.active, v.created_at,
             m.name AS set_by_name, m.avatar_emoji
      FROM memory_verses v
      JOIN members m ON m.id = v.set_by
      ORDER BY v.month DESC
    `).all();
    return json({ verses: verses.results || [] });
  }

  // Get current month's verse
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const verse = await env.DB.prepare(`
    SELECT v.id, v.reference, v.text, v.month, v.created_at,
           m.name AS set_by_name, m.avatar_emoji
    FROM memory_verses v
    JOIN members m ON m.id = v.set_by
    WHERE v.month = ? AND v.active = 1
    LIMIT 1
  `).bind(currentMonth).first();

  if (!verse) {
    return json({ verse: null, activities: [], progress: [], recordings: [], family_progress: [] });
  }

  // Get activities
  const activities = await env.DB.prepare(
    'SELECT id, week, type, title, description FROM verse_activities WHERE verse_id = ? ORDER BY week'
  ).bind(verse.id).all();

  // Get my progress
  const myProgress = await env.DB.prepare(
    'SELECT activity_id, completed_at FROM verse_progress WHERE verse_id = ? AND member_id = ?'
  ).bind(verse.id, member.id).all();

  // Get all family progress (who completed what)
  const familyProgress = await env.DB.prepare(`
    SELECT vp.activity_id, vp.member_id, vp.completed_at,
           m.name, m.avatar_emoji
    FROM verse_progress vp
    JOIN members m ON m.id = vp.member_id
    WHERE vp.verse_id = ?
    ORDER BY vp.completed_at ASC
  `).bind(verse.id).all();

  // Get recordings
  const recordings = await env.DB.prepare(`
    SELECT vr.id, vr.media_url, vr.media_type, vr.created_at,
           vr.member_id, m.name, m.avatar_emoji
    FROM verse_recordings vr
    JOIN members m ON m.id = vr.member_id
    WHERE vr.verse_id = ?
    ORDER BY vr.created_at DESC
  `).bind(verse.id).all();

  // Get game scores — best per person per game type
  let scores = [];
  try {
    const scoresResult = await env.DB.prepare(`
      SELECT vs.game_type, vs.score_ms, vs.score_pct, vs.created_at,
             vs.member_id, m.name, m.avatar_emoji,
             MIN(vs.score_ms) AS best_ms
      FROM verse_scores vs
      JOIN members m ON m.id = vs.member_id
      WHERE vs.verse_id = ?
      GROUP BY vs.member_id, vs.game_type
      ORDER BY vs.game_type, vs.score_ms ASC
    `).bind(verse.id).all();
    scores = scoresResult.results || [];
  } catch (e) { /* table may not exist yet */ }

  // My personal bests
  let myScores = [];
  try {
    const myScoresResult = await env.DB.prepare(`
      SELECT game_type, MIN(score_ms) AS best_ms, MAX(score_pct) AS best_pct,
             COUNT(*) AS attempts
      FROM verse_scores
      WHERE verse_id = ? AND member_id = ?
      GROUP BY game_type
    `).bind(verse.id, member.id).all();
    myScores = myScoresResult.results || [];
  } catch (e) { /* table may not exist yet */ }

  // Calculate current week of month (1-4)
  const weekOfMonth = Math.min(4, Math.ceil(now.getDate() / 7));

  return json({
    verse,
    activities: activities.results || [],
    my_progress: myProgress.results || [],
    family_progress: familyProgress.results || [],
    recordings: recordings.results || [],
    scores,
    my_scores: myScores,
    current_week: weekOfMonth
  });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();
  if (member.role !== 'admin') return forbidden('Only admins can set the verse');

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { reference, text, month } = body;
  if (!reference || !text) return badRequest('Reference and text are required');

  const now = new Date();
  const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Deactivate any existing verse for this month
  await env.DB.prepare(
    'UPDATE memory_verses SET active = 0 WHERE month = ?'
  ).bind(targetMonth).run();

  // Insert new verse
  const result = await env.DB.prepare(
    'INSERT INTO memory_verses (reference, text, month, set_by) VALUES (?, ?, ?, ?)'
  ).bind(reference.trim(), text.trim(), targetMonth, member.id).run();

  const verseId = result.meta.last_row_id;

  // Create the 4 weekly activities
  for (const act of WEEKLY_ACTIVITIES) {
    await env.DB.prepare(
      'INSERT INTO verse_activities (verse_id, week, type, title, description) VALUES (?, ?, ?, ?, ?)'
    ).bind(verseId, act.week, act.type, act.title, act.description).run();
  }

  return json({ ok: true, id: verseId });
}

export async function onRequestPut({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { verse_id, activity_id, recording_url, recording_type, game_type, score_ms, score_pct } = body;
  if (!verse_id) return badRequest('verse_id required');

  // If submitting a game score
  if (game_type) {
    await env.DB.prepare(
      'INSERT INTO verse_scores (verse_id, member_id, game_type, score_ms, score_pct) VALUES (?, ?, ?, ?, ?)'
    ).bind(verse_id, member.id, game_type, score_ms || null, score_pct || null).run();
    return json({ ok: true, type: 'score' });
  }

  // If submitting a recording
  if (recording_url) {
    await env.DB.prepare(
      'INSERT INTO verse_recordings (verse_id, member_id, media_url, media_type) VALUES (?, ?, ?, ?)'
    ).bind(verse_id, member.id, recording_url, recording_type || 'video').run();
    return json({ ok: true, type: 'recording' });
  }

  // Mark activity complete (or overall memorized if activity_id is null)
  await env.DB.prepare(
    'INSERT OR IGNORE INTO verse_progress (verse_id, member_id, activity_id) VALUES (?, ?, ?)'
  ).bind(verse_id, member.id, activity_id || null).run();

  return json({ ok: true, type: 'progress' });
}

export async function onRequestDelete({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();
  if (member.role !== 'admin') return forbidden('Only admins can delete verses');

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id } = body;
  if (!id) return badRequest('Verse ID required');

  await env.DB.batch([
    env.DB.prepare('DELETE FROM verse_recordings WHERE verse_id = ?').bind(id),
    env.DB.prepare('DELETE FROM verse_progress WHERE verse_id = ?').bind(id),
    env.DB.prepare('DELETE FROM verse_activities WHERE verse_id = ?').bind(id),
    env.DB.prepare('DELETE FROM memory_verses WHERE id = ?').bind(id),
  ]);

  return json({ ok: true });
}
