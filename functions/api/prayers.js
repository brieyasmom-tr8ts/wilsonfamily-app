// GET    /api/prayers — list all prayers/praises with pray counts
// POST   /api/prayers — post a prayer or praise
// PUT    /api/prayers — mark as answered (owner or admin)
// DELETE /api/prayers — delete (owner or admin)

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const url = new URL(request.url);
  const filter = url.searchParams.get('filter'); // 'prayer', 'praise', 'answered', or null

  let where = '';
  if (filter === 'prayer') where = "AND p.type = 'prayer' AND p.answered = 0";
  else if (filter === 'praise') where = "AND p.type = 'praise'";
  else if (filter === 'answered') where = 'AND p.answered = 1';

  const prayers = await env.DB.prepare(`
    SELECT p.id, p.content, p.type, p.answered, p.answered_note, p.created_at,
           p.posted_by, m.name AS posted_by_name, m.avatar_emoji,
           (SELECT COUNT(*) FROM prayer_responses pr WHERE pr.prayer_id = p.id) AS pray_count,
           (SELECT pr.id FROM prayer_responses pr WHERE pr.prayer_id = p.id AND pr.member_id = ?) AS i_prayed
    FROM prayers p
    JOIN members m ON m.id = p.posted_by
    WHERE 1=1 ${where}
    ORDER BY p.created_at DESC
  `).bind(member.id).all();

  return json({ prayers: prayers.results || [] });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { content, type } = body;
  if (!content || !content.trim()) return badRequest('Content is required');

  const validTypes = ['prayer', 'praise'];
  const pType = validTypes.includes(type) ? type : 'prayer';

  await env.DB.prepare(
    'INSERT INTO prayers (content, type, posted_by) VALUES (?, ?, ?)'
  ).bind(content.trim(), pType, member.id).run();

  return json({ ok: true });
}

export async function onRequestPut({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id, answered, answered_note } = body;
  if (!id) return badRequest('Prayer ID required');

  const prayer = await env.DB.prepare('SELECT posted_by FROM prayers WHERE id = ?').bind(id).first();
  if (!prayer) return badRequest('Not found');
  if (prayer.posted_by !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  await env.DB.prepare(
    'UPDATE prayers SET answered = ?, answered_note = ? WHERE id = ?'
  ).bind(answered ? 1 : 0, (answered_note || '').trim() || null, id).run();

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id } = body;
  if (!id) return badRequest('Prayer ID required');

  const prayer = await env.DB.prepare('SELECT posted_by FROM prayers WHERE id = ?').bind(id).first();
  if (!prayer) return badRequest('Not found');
  if (prayer.posted_by !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  await env.DB.batch([
    env.DB.prepare('DELETE FROM prayer_responses WHERE prayer_id = ?').bind(id),
    env.DB.prepare('DELETE FROM prayers WHERE id = ?').bind(id)
  ]);

  return json({ ok: true });
}
