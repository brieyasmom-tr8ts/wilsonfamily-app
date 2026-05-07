// POST /api/auth/setup
// Complete profile: username, birthday, anniversary, avatar_emoji
// Requires auth (must be signed in already via join)

import { getCurrentMember, json, badRequest, unauthorized } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const me = await getCurrentMember(request, env);
  if (!me) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid request body');
  }

  const { username, birthday, anniversary, avatar_emoji } = body;

  if (!username || !username.trim()) return badRequest('Username is required');

  const trimmed = username.trim().toLowerCase();
  if (trimmed.length < 2 || trimmed.length > 30) return badRequest('Username must be 2-30 characters');
  if (!/^[a-z0-9._-]+$/.test(trimmed)) return badRequest('Username can only have letters, numbers, dots, dashes');

  // Check username uniqueness
  const existing = await env.DB.prepare(
    'SELECT id FROM members WHERE lower(username) = ? AND id != ?'
  ).bind(trimmed, me.id).first();

  if (existing) return badRequest('That username is taken. Try another.');

  // Validate date formats if provided (YYYY-MM-DD)
  const datePattern = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  if (birthday && !datePattern.test(birthday)) return badRequest('Birthday should be YYYY-MM-DD format');
  if (anniversary && !datePattern.test(anniversary)) return badRequest('Anniversary should be YYYY-MM-DD format');

  await env.DB.prepare(`
    UPDATE members
    SET username = ?, birthday = ?, anniversary = ?, avatar_emoji = ?, profile_complete = 1
    WHERE id = ?
  `).bind(
    trimmed,
    birthday || null,
    anniversary || null,
    avatar_emoji || '🌱',
    me.id
  ).run();

  return json({ ok: true });
}
