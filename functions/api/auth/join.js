// POST /api/auth/join
// Join the family with name, email, and family code.
// Creates a member and signs them in immediately (no email required).

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

  // Check the family code
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
    'SELECT id FROM members WHERE lower(email) = ?'
  ).bind(trimmedEmail).first();

  let memberId;

  if (existing) {
    memberId = existing.id;
  } else {
    // Create new member
    const result = await env.DB.prepare(
      'INSERT INTO members (name, email, role, avatar_emoji) VALUES (?, ?, ?, ?)'
    ).bind(trimmedName, trimmedEmail, 'member', '🌱').run();
    memberId = result.meta.last_row_id;
  }

  // Create session and sign them in
  const now = Math.floor(Date.now() / 1000);
  const sessionId = generateSessionId();
  const sessionExpires = now + 60 * 60 * 24 * 30; // 30 days

  await env.DB.prepare(
    'INSERT INTO sessions (id, member_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, memberId, sessionExpires).run();

  return json({ ok: true, name: trimmedName }, {
    headers: { 'Set-Cookie': setSessionCookie(sessionId) }
  });
}
