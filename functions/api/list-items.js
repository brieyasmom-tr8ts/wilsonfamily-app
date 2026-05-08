// GET    /api/list-items?list_id=X — items for a list
// POST   /api/list-items — add item to a list
// PUT    /api/list-items — toggle checked or edit text
// DELETE /api/list-items — remove item

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const url = new URL(request.url);
  const listId = parseInt(url.searchParams.get('list_id'));
  if (!listId) return badRequest('list_id required');

  const items = await env.DB.prepare(`
    SELECT li.id, li.text, li.checked, li.added_by, li.created_at,
           m.name AS added_by_name
    FROM list_items li
    JOIN members m ON m.id = li.added_by
    WHERE li.list_id = ?
    ORDER BY li.checked ASC, li.created_at ASC
  `).bind(listId).all();

  return json({ items: items.results || [] });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { list_id, text } = body;
  if (!list_id || !text || !text.trim()) return badRequest('List ID and text required');

  // Check permission
  const list = await env.DB.prepare('SELECT owner_id, allow_others_add FROM lists WHERE id = ?').bind(list_id).first();
  if (!list) return badRequest('List not found');
  if (list.owner_id !== member.id && !list.allow_others_add && member.role !== 'admin') {
    return forbidden('This list doesn\'t allow others to add items');
  }

  await env.DB.prepare(
    'INSERT INTO list_items (list_id, text, added_by) VALUES (?, ?, ?)'
  ).bind(list_id, text.trim(), member.id).run();

  return json({ ok: true });
}

export async function onRequestPut({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id, checked, text } = body;
  if (!id) return badRequest('Item ID required');

  const sets = [];
  const vals = [];
  if (checked !== undefined) { sets.push('checked = ?'); vals.push(checked ? 1 : 0); }
  if (text !== undefined) { sets.push('text = ?'); vals.push(text.trim()); }

  if (sets.length === 0) return badRequest('Nothing to update');
  vals.push(id);

  await env.DB.prepare(`UPDATE list_items SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id } = body;
  if (!id) return badRequest('Item ID required');

  // Check ownership of the item or list
  const item = await env.DB.prepare(`
    SELECT li.added_by, l.owner_id FROM list_items li
    JOIN lists l ON l.id = li.list_id WHERE li.id = ?
  `).bind(id).first();

  if (!item) return badRequest('Not found');
  if (item.added_by !== member.id && item.owner_id !== member.id && member.role !== 'admin') {
    return forbidden('Not allowed');
  }

  await env.DB.prepare('DELETE FROM list_items WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
