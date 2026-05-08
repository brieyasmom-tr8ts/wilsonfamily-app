// POST /api/photos/update — edit caption, style, date (owner or admin)

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id, caption, page_style, taken_date } = body;
  if (!id) return badRequest('Photo ID required');

  const photo = await env.DB.prepare('SELECT uploaded_by FROM photos WHERE id = ?').bind(id).first();
  if (!photo) return badRequest('Photo not found');
  if (photo.uploaded_by !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  const sets = [];
  const vals = [];
  if (caption !== undefined) { sets.push('caption = ?'); vals.push(caption || null); }
  if (page_style !== undefined) { sets.push('page_style = ?'); vals.push(page_style); }
  if (taken_date !== undefined) { sets.push('taken_date = ?'); vals.push(taken_date || null); }

  if (sets.length === 0) return badRequest('Nothing to update');
  vals.push(id);

  await env.DB.prepare(`UPDATE photos SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
}
