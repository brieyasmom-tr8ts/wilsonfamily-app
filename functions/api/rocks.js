// GET    /api/rocks — list all rocks
// POST   /api/rocks — create a rock (any member)
// PUT    /api/rocks — edit a rock (owner or admin)
// DELETE /api/rocks — delete a rock (owner or admin)

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const rocks = await env.DB.prepare(`
    SELECT r.id, r.word, r.story, r.media_type, r.media_url, r.color, r.created_at,
           r.created_by, m.name AS author_name, m.avatar_emoji
    FROM rocks r
    JOIN members m ON m.id = r.created_by
    ORDER BY r.created_at DESC
  `).all();

  return json({ rocks: rocks.results || [] });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { word, story, media_type, media_url, color } = body;
  if (!word || !word.trim()) return badRequest('A word or phrase is required');
  if (word.trim().length > 60) return badRequest('Keep it to 60 characters or less');

  const validMedia = ['text', 'audio', 'video', null];
  const mType = validMedia.includes(media_type) ? media_type : null;

  const result = await env.DB.prepare(
    'INSERT INTO rocks (word, story, media_type, media_url, color, created_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    word.trim(),
    (story || '').trim() || null,
    mType,
    (media_url || '').trim() || null,
    color || '#64748b',
    member.id
  ).run();

  return json({ ok: true, id: result.meta.last_row_id });
}

export async function onRequestPut({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id, word, story, media_type, media_url, color } = body;
  if (!id) return badRequest('Rock ID is required');

  // Check ownership or admin
  const rock = await env.DB.prepare('SELECT created_by FROM rocks WHERE id = ?').bind(id).first();
  if (!rock) return badRequest('Rock not found');
  if (rock.created_by !== member.id && member.role !== 'admin') {
    return forbidden('You can only edit your own rocks');
  }

  const sets = [];
  const vals = [];
  if (word !== undefined) { sets.push('word = ?'); vals.push(word.trim()); }
  if (story !== undefined) { sets.push('story = ?'); vals.push(story.trim() || null); }
  if (media_type !== undefined) { sets.push('media_type = ?'); vals.push(media_type || null); }
  if (media_url !== undefined) { sets.push('media_url = ?'); vals.push(media_url.trim() || null); }
  if (color !== undefined) { sets.push('color = ?'); vals.push(color); }

  if (sets.length === 0) return badRequest('Nothing to update');

  vals.push(id);
  await env.DB.prepare(`UPDATE rocks SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id } = body;
  if (!id) return badRequest('Rock ID is required');

  const rock = await env.DB.prepare('SELECT created_by FROM rocks WHERE id = ?').bind(id).first();
  if (!rock) return badRequest('Rock not found');
  if (rock.created_by !== member.id && member.role !== 'admin') {
    return forbidden('You can only delete your own rocks');
  }

  await env.DB.prepare('DELETE FROM rocks WHERE id = ?').bind(id).run();

  return json({ ok: true });
}
