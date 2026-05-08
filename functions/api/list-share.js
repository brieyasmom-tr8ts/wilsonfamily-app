// GET  /api/list-share?token=... — public view of a shared list (no auth)
// POST /api/list-share — generate/toggle share link (auth required, owner or admin)

import { getCurrentMember, generateToken, json, badRequest, unauthorized, forbidden } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return badRequest('Missing share token');

  const list = await env.DB.prepare(`
    SELECT l.id, l.title, l.has_checkboxes, l.owner_id,
           m.name AS owner_name, m.avatar_emoji
    FROM lists l
    JOIN members m ON m.id = l.owner_id
    WHERE l.share_token = ?
  `).bind(token).first();

  if (!list) return json({ error: 'List not found or sharing is off' }, { status: 404 });

  const items = await env.DB.prepare(`
    SELECT li.id, li.text, li.checked, m.name AS added_by_name
    FROM list_items li
    JOIN members m ON m.id = li.added_by
    WHERE li.list_id = ?
    ORDER BY li.checked ASC, li.created_at ASC
  `).bind(list.id).all();

  return json({
    title: list.title,
    has_checkboxes: list.has_checkboxes,
    owner_name: list.owner_name,
    owner_emoji: list.avatar_emoji,
    items: items.results || []
  });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { list_id, enable } = body;
  if (!list_id) return badRequest('list_id required');

  const list = await env.DB.prepare('SELECT owner_id, share_token FROM lists WHERE id = ?').bind(list_id).first();
  if (!list) return badRequest('List not found');
  if (list.owner_id !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  if (enable === false) {
    // Disable sharing
    await env.DB.prepare('UPDATE lists SET share_token = NULL WHERE id = ?').bind(list_id).run();
    return json({ ok: true, share_token: null });
  }

  // Enable or refresh sharing
  const token = list.share_token || generateToken().slice(0, 16);
  await env.DB.prepare('UPDATE lists SET share_token = ? WHERE id = ?').bind(token, list_id).run();

  return json({ ok: true, share_token: token });
}
