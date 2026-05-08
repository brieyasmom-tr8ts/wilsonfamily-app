// GET    /api/albums — list all albums with photo counts
// POST   /api/albums — create an album
// PUT    /api/albums — edit album (owner or admin)
// DELETE /api/albums — delete album (owner or admin, photos stay)

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const albums = await env.DB.prepare(`
    SELECT a.id, a.title, a.description, a.cover_photo_id, a.created_at,
           m.name AS created_by_name, m.avatar_emoji,
           (SELECT COUNT(*) FROM photos p WHERE p.album_id = a.id) AS photo_count,
           (SELECT p.r2_key FROM photos p WHERE p.id = a.cover_photo_id) AS cover_r2_key
    FROM albums a
    JOIN members m ON m.id = a.created_by
    ORDER BY a.created_at DESC
  `).all();

  const result = (albums.results || []).map(a => ({
    ...a,
    cover_url: a.cover_r2_key ? `/api/media/${a.cover_r2_key}` : null
  }));

  return json({ albums: result });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const title = (body.title || '').trim();
  const description = (body.description || '').trim() || null;
  if (!title) return badRequest('Title is required');

  const result = await env.DB.prepare(
    'INSERT INTO albums (title, description, created_by) VALUES (?, ?, ?)'
  ).bind(title, description, member.id).run();

  return json({ ok: true, id: result.meta.last_row_id });
}

export async function onRequestPut({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id, title, description, cover_photo_id } = body;
  if (!id) return badRequest('Album ID required');

  const album = await env.DB.prepare('SELECT created_by FROM albums WHERE id = ?').bind(id).first();
  if (!album) return badRequest('Album not found');
  if (album.created_by !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  const sets = [];
  const vals = [];
  if (title !== undefined) { sets.push('title = ?'); vals.push(title.trim()); }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description.trim() || null); }
  if (cover_photo_id !== undefined) { sets.push('cover_photo_id = ?'); vals.push(cover_photo_id || null); }

  if (sets.length === 0) return badRequest('Nothing to update');
  vals.push(id);

  await env.DB.prepare(`UPDATE albums SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id } = body;
  if (!id) return badRequest('Album ID required');

  const album = await env.DB.prepare('SELECT created_by FROM albums WHERE id = ?').bind(id).first();
  if (!album) return badRequest('Album not found');
  if (album.created_by !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  // Unlink photos from this album (don't delete them)
  await env.DB.batch([
    env.DB.prepare('UPDATE photos SET album_id = NULL WHERE album_id = ?').bind(id),
    env.DB.prepare('DELETE FROM albums WHERE id = ?').bind(id)
  ]);

  return json({ ok: true });
}
