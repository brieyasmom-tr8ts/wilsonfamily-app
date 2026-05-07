// GET    /api/photos — list photos (optional ?member=id to filter by tagged person)
// POST   /api/photos — upload photo with caption and tags
// DELETE /api/photos — delete (owner or admin)

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const url = new URL(request.url);
  const filterMember = url.searchParams.get('member');
  const page = parseInt(url.searchParams.get('page')) || 1;
  const limit = 24;
  const offset = (page - 1) * limit;

  let query, binds;

  if (filterMember) {
    query = `
      SELECT p.id, p.r2_key, p.caption, p.taken_date, p.created_at,
             p.uploaded_by, m.name AS uploaded_by_name, m.avatar_emoji
      FROM photos p
      JOIN members m ON m.id = p.uploaded_by
      JOIN photo_tags pt ON pt.photo_id = p.id AND pt.member_id = ?
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    binds = [parseInt(filterMember), limit, offset];
  } else {
    query = `
      SELECT p.id, p.r2_key, p.caption, p.taken_date, p.created_at,
             p.uploaded_by, m.name AS uploaded_by_name, m.avatar_emoji
      FROM photos p
      JOIN members m ON m.id = p.uploaded_by
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    binds = [limit, offset];
  }

  const photos = await env.DB.prepare(query).bind(...binds).all();

  // Get tags for each photo
  const photoIds = (photos.results || []).map(p => p.id);
  let tags = [];
  if (photoIds.length > 0) {
    const placeholders = photoIds.map(() => '?').join(',');
    const tagResult = await env.DB.prepare(`
      SELECT pt.photo_id, m.id AS member_id, m.name, m.avatar_emoji
      FROM photo_tags pt
      JOIN members m ON m.id = pt.member_id
      WHERE pt.photo_id IN (${placeholders})
    `).bind(...photoIds).all();
    tags = tagResult.results || [];
  }

  // Group tags by photo
  const tagsByPhoto = {};
  for (const t of tags) {
    if (!tagsByPhoto[t.photo_id]) tagsByPhoto[t.photo_id] = [];
    tagsByPhoto[t.photo_id].push({ id: t.member_id, name: t.name, avatar_emoji: t.avatar_emoji });
  }

  const result = (photos.results || []).map(p => ({
    ...p,
    url: `/api/media/${p.r2_key}`,
    tags: tagsByPhoto[p.id] || []
  }));

  return json({ photos: result, page });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const contentType = request.headers.get('Content-Type') || '';
  if (!contentType.includes('multipart/form-data')) return badRequest('Expected multipart/form-data');

  const formData = await request.formData();
  const file = formData.get('file');
  if (!file || !file.size) return badRequest('No photo uploaded');

  const maxSize = 20 * 1024 * 1024; // 20MB for photos
  if (file.size > maxSize) return badRequest('Photo too large (max 20MB)');

  const mimeType = file.type || 'image/jpeg';
  if (!mimeType.startsWith('image/')) return badRequest('Only image files allowed');

  // Upload to R2
  const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpg';
  const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  await env.MEDIA.put(key, file.stream(), {
    httpMetadata: { contentType: mimeType },
    customMetadata: { uploadedBy: String(member.id) }
  });

  // Insert photo record
  const caption = formData.get('caption') || null;
  const takenDate = formData.get('taken_date') || null;
  const tagIds = formData.get('tags'); // comma-separated member IDs

  const result = await env.DB.prepare(
    'INSERT INTO photos (r2_key, caption, taken_date, uploaded_by) VALUES (?, ?, ?, ?)'
  ).bind(key, caption, takenDate, member.id).run();

  const photoId = result.meta.last_row_id;

  // Insert tags
  if (tagIds) {
    const ids = tagIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    for (const tid of ids) {
      await env.DB.prepare(
        'INSERT OR IGNORE INTO photo_tags (photo_id, member_id) VALUES (?, ?)'
      ).bind(photoId, tid).run();
    }
  }

  return json({ ok: true, id: photoId, url: `/api/media/${key}` });
}

export async function onRequestDelete({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id } = body;
  if (!id) return badRequest('Photo ID required');

  const photo = await env.DB.prepare('SELECT uploaded_by, r2_key FROM photos WHERE id = ?').bind(id).first();
  if (!photo) return badRequest('Photo not found');
  if (photo.uploaded_by !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  await env.DB.batch([
    env.DB.prepare('DELETE FROM photo_tags WHERE photo_id = ?').bind(id),
    env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id)
  ]);

  // Delete from R2
  await env.MEDIA.delete(photo.r2_key);

  return json({ ok: true });
}
