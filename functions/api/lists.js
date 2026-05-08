// GET    /api/lists — lists visible to current user
// POST   /api/lists — create a list
// PUT    /api/lists — edit list settings (owner or admin)
// DELETE /api/lists — delete a list (owner or admin)

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

function canSee(list, memberId) {
  if (list.visibility === 'everyone') return true;
  const ids = (list.visibility_members || '').split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
  if (list.visibility === 'only') return ids.includes(memberId) || list.owner_id === memberId;
  if (list.visibility === 'hide_from') return !ids.includes(memberId);
  return true;
}

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const url = new URL(request.url);
  const showArchived = url.searchParams.get('archived') === '1';

  const lists = await env.DB.prepare(`
    SELECT l.id, l.title, l.owner_id, l.has_checkboxes, l.allow_others_add,
           l.visibility, l.visibility_members, l.archived, l.created_at,
           m.name AS owner_name, m.avatar_emoji,
           (SELECT COUNT(*) FROM list_items li WHERE li.list_id = l.id) AS item_count,
           (SELECT COUNT(*) FROM list_items li WHERE li.list_id = l.id AND li.checked = 1) AS checked_count
    FROM lists l
    JOIN members m ON m.id = l.owner_id
    WHERE l.archived = ?
    ORDER BY l.created_at DESC
  `).bind(showArchived ? 1 : 0).all();

  // Filter by visibility
  const visible = (lists.results || []).filter(l => canSee(l, member.id) || member.role === 'admin');

  return json({ lists: visible });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { title, has_checkboxes, allow_others_add, visibility, visibility_members } = body;
  if (!title || !title.trim()) return badRequest('Title is required');

  const validVis = ['everyone', 'only', 'hide_from'];
  const vis = validVis.includes(visibility) ? visibility : 'everyone';

  await env.DB.prepare(
    'INSERT INTO lists (title, owner_id, has_checkboxes, allow_others_add, visibility, visibility_members) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    title.trim(),
    member.id,
    has_checkboxes !== false ? 1 : 0,
    allow_others_add ? 1 : 0,
    vis,
    visibility_members || null
  ).run();

  return json({ ok: true });
}

export async function onRequestPut({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id, title, has_checkboxes, allow_others_add, visibility, visibility_members, archived } = body;
  if (!id) return badRequest('List ID required');

  const list = await env.DB.prepare('SELECT owner_id FROM lists WHERE id = ?').bind(id).first();
  if (!list) return badRequest('List not found');
  if (list.owner_id !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  const sets = [];
  const vals = [];
  if (title !== undefined) { sets.push('title = ?'); vals.push(title.trim()); }
  if (has_checkboxes !== undefined) { sets.push('has_checkboxes = ?'); vals.push(has_checkboxes ? 1 : 0); }
  if (allow_others_add !== undefined) { sets.push('allow_others_add = ?'); vals.push(allow_others_add ? 1 : 0); }
  if (visibility !== undefined) { sets.push('visibility = ?'); vals.push(visibility); }
  if (visibility_members !== undefined) { sets.push('visibility_members = ?'); vals.push(visibility_members || null); }
  if (archived !== undefined) { sets.push('archived = ?'); vals.push(archived ? 1 : 0); }

  if (sets.length === 0) return badRequest('Nothing to update');
  vals.push(id);

  await env.DB.prepare(`UPDATE lists SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id } = body;
  if (!id) return badRequest('List ID required');

  const list = await env.DB.prepare('SELECT owner_id FROM lists WHERE id = ?').bind(id).first();
  if (!list) return badRequest('Not found');
  if (list.owner_id !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  await env.DB.batch([
    env.DB.prepare('DELETE FROM list_items WHERE list_id = ?').bind(id),
    env.DB.prepare('DELETE FROM lists WHERE id = ?').bind(id)
  ]);

  return json({ ok: true });
}
