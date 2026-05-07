// GET  /api/admin/members — list all members
// POST /api/admin/members — create a member
// PUT  /api/admin/members — update a member
// DELETE /api/admin/members — remove a member
// All admin-only (role = 'admin')

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../../_lib.js';

function requireAdmin(member) {
  if (!member) return unauthorized();
  if (member.role !== 'admin') return forbidden('Admin access required');
  return null;
}

export async function onRequestGet({ request, env }) {
  const me = await getCurrentMember(request, env);
  const err = requireAdmin(me);
  if (err) return err;

  const members = await env.DB.prepare(
    'SELECT id, name, email, role, avatar_emoji, username, birthday, anniversary, profile_complete, created_at FROM members ORDER BY created_at'
  ).all();

  return json({ members: members.results || [] });
}

export async function onRequestPost({ request, env }) {
  const me = await getCurrentMember(request, env);
  const err = requireAdmin(me);
  if (err) return err;

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { name, email, role, avatar_emoji } = body;
  if (!name || !name.trim()) return badRequest('Name is required');
  if (!email || !email.trim()) return badRequest('Email is required');

  const validRoles = ['member', 'parent', 'admin'];
  const memberRole = validRoles.includes(role) ? role : 'member';

  await env.DB.prepare(
    'INSERT INTO members (name, email, role, avatar_emoji) VALUES (?, ?, ?, ?)'
  ).bind(name.trim(), email.trim().toLowerCase(), memberRole, avatar_emoji || '🌱').run();

  return json({ ok: true });
}

export async function onRequestPut({ request, env }) {
  const me = await getCurrentMember(request, env);
  const err = requireAdmin(me);
  if (err) return err;

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id, name, email, role, avatar_emoji, username, birthday, anniversary } = body;
  if (!id) return badRequest('Member ID is required');

  const validRoles = ['member', 'parent', 'admin'];
  const memberRole = validRoles.includes(role) ? role : undefined;

  // Build dynamic update
  const sets = [];
  const vals = [];
  if (name) { sets.push('name = ?'); vals.push(name.trim()); }
  if (email) { sets.push('email = ?'); vals.push(email.trim().toLowerCase()); }
  if (memberRole) { sets.push('role = ?'); vals.push(memberRole); }
  if (avatar_emoji !== undefined) { sets.push('avatar_emoji = ?'); vals.push(avatar_emoji); }
  if (username !== undefined) { sets.push('username = ?'); vals.push(username ? username.trim().toLowerCase() : null); }
  if (birthday !== undefined) { sets.push('birthday = ?'); vals.push(birthday || null); }
  if (anniversary !== undefined) { sets.push('anniversary = ?'); vals.push(anniversary || null); }

  if (sets.length === 0) return badRequest('Nothing to update');

  vals.push(id);
  await env.DB.prepare(`UPDATE members SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const me = await getCurrentMember(request, env);
  const err = requireAdmin(me);
  if (err) return err;

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id } = body;
  if (!id) return badRequest('Member ID is required');
  if (id === me.id) return badRequest('You cannot remove yourself');

  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE member_id = ?').bind(id),
    env.DB.prepare('DELETE FROM contributions WHERE member_id = ?').bind(id),
    env.DB.prepare('DELETE FROM members WHERE id = ?').bind(id)
  ]);

  return json({ ok: true });
}
