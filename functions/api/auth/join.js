// POST /api/auth/join
// First-time join: name + email + family code
// Creates member, signs in, returns { ok, needs_setup }

import { generateSessionId, setSessionCookie, json, badRequest } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid request body');
  }

  const { name, email, code } = body;
  if (!name || !name.trim()) return badRequest('Name is required');
  if (!email || !email.trim()) return badRequest('Email is required');
  if (!code || !code.trim()) return badRequest('Family code is required');

  const familyCode = env.FAMILY_CODE || '';
  if (!familyCode) {
    return json({ error: 'Family code is not configured yet.' }, { status: 500 });
  }

  if (code.trim().toLowerCase() !== familyCode.toLowerCase()) {
    return json({ error: 'That\u2019s not the right family code.' }, { status: 403 });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const trimmedName = name.trim();

  // Check if email already exists
  const existing = await env.DB.prepare(
    'SELECT id, profile_complete FROM members WHERE lower(email) = ?'
  ).bind(trimmedEmail).first();

  let memberId;
  let needsSetup = true;

  if (existing) {
    memberId = existing.id;
    needsSetup = !existing.profile_complete;
  } else {
    const result = await env.DB.prepare(
      'INSERT INTO members (name, email, role, avatar_emoji) VALUES (?, ?, ?, ?)'
    ).bind(trimmedName, trimmedEmail, 'member', '🌱').run();
    memberId = result.meta.last_row_id;
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionId = generateSessionId();
  const sessionExpires = now + 60 * 60 * 24 * 30;

  await env.DB.prepare(
    'INSERT INTO sessions (id, member_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, memberId, sessionExpires).run();

  return json({ ok: true, name: trimmedName, needs_setup: needsSetup }, {
    headers: { 'Set-Cookie': setSessionCookie(sessionId) }
  });
}
