// GET  /api/profile?id=X — view a member's profile (any signed-in user)
// PUT  /api/profile — update your own profile

import { getCurrentMember, json, badRequest, unauthorized } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const me = await getCurrentMember(request, env);
  if (!me) return unauthorized();

  const url = new URL(request.url);
  const id = parseInt(url.searchParams.get('id')) || me.id;

  const member = await env.DB.prepare(`
    SELECT id, name, avatar_emoji, username, birthday, anniversary, role, created_at,
           favorite_icecream, favorite_snack, favorite_color, favorite_game,
           favorite_movie, favorite_song, favorite_hobby, fun_fact
    FROM members WHERE id = ?
  `).bind(id).first();

  if (!member) return badRequest('Member not found');

  return json({ member, is_me: id === me.id });
}

export async function onRequestPut({ request, env }) {
  const me = await getCurrentMember(request, env);
  if (!me) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const allowed = [
    'name', 'avatar_emoji', 'username', 'birthday', 'anniversary',
    'favorite_icecream', 'favorite_snack', 'favorite_color', 'favorite_game',
    'favorite_movie', 'favorite_song', 'favorite_hobby', 'fun_fact'
  ];

  const sets = [];
  const vals = [];

  for (const key of allowed) {
    if (body[key] !== undefined) {
      if (key === 'username') {
        const trimmed = (body[key] || '').trim().toLowerCase();
        if (trimmed.length < 2 || trimmed.length > 30) return badRequest('Username must be 2-30 characters');
        if (!/^[a-z0-9._\- ]+$/.test(trimmed)) return badRequest('Username can only have letters, numbers, dots, dashes, spaces');
        const existing = await env.DB.prepare(
          'SELECT id FROM members WHERE lower(username) = ? AND id != ?'
        ).bind(trimmed, me.id).first();
        if (existing) return badRequest('That username is taken');
        sets.push('username = ?');
        vals.push(trimmed);
      } else {
        sets.push(`${key} = ?`);
        vals.push(body[key] || null);
      }
    }
  }

  if (sets.length === 0) return badRequest('Nothing to update');

  vals.push(me.id);
  await env.DB.prepare(`UPDATE members SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  return json({ ok: true });
}
