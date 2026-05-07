// GET  /api/receptions?suggestion_id=X — get updates for a suggestion
// POST /api/receptions — add a reception update (story + optional image)

import { getCurrentMember, json, badRequest, unauthorized } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const url = new URL(request.url);
  const suggestionId = url.searchParams.get('suggestion_id');
  if (!suggestionId) return badRequest('suggestion_id required');

  const receptions = await env.DB.prepare(`
    SELECT r.id, r.content, r.image_r2_key, r.created_at,
           m.name AS added_by_name, m.avatar_emoji
    FROM receptions r
    JOIN members m ON m.id = r.added_by
    WHERE r.suggestion_id = ?
    ORDER BY r.created_at ASC
  `).bind(parseInt(suggestionId)).all();

  const results = (receptions.results || []).map(r => ({
    ...r,
    image_url: r.image_r2_key ? `/api/media/${r.image_r2_key}` : null
  }));

  return json({ receptions: results });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const contentType = request.headers.get('Content-Type') || '';

  let suggestionId, content, imageKey = null;

  if (contentType.includes('multipart/form-data')) {
    const formData = await request.formData();
    suggestionId = parseInt(formData.get('suggestion_id'));
    content = (formData.get('content') || '').trim();

    const file = formData.get('image');
    if (file && file.size > 0) {
      const mimeType = file.type || 'image/jpeg';
      if (!mimeType.startsWith('image/')) return badRequest('Only image files allowed');
      if (file.size > 20 * 1024 * 1024) return badRequest('Image too large (max 20MB)');

      const ext = mimeType.split('/')[1]?.split(';')[0] || 'jpg';
      imageKey = `reception-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

      await env.MEDIA.put(imageKey, file.stream(), {
        httpMetadata: { contentType: mimeType }
      });
    }
  } else {
    let body;
    try { body = await request.json(); } catch { return badRequest('Invalid request'); }
    suggestionId = body.suggestion_id;
    content = (body.content || '').trim();
  }

  if (!suggestionId) return badRequest('Suggestion ID required');
  if (!content) return badRequest('Please share the story');

  await env.DB.prepare(
    'INSERT INTO receptions (suggestion_id, added_by, content, image_r2_key) VALUES (?, ?, ?, ?)'
  ).bind(suggestionId, member.id, content, imageKey).run();

  return json({ ok: true });
}
