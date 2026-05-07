// POST /api/auth/login
// Returning user login: username + family code
// Creates session and signs in

import { generateSessionId, setSessionCookie, json, badRequest } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid request body');
  }

  const { username, code } = body;
  if (!username || !username.trim()) return badRequest('Username is required');
  if (!code || !code.trim()) return badRequest('Family code is required');

  const familyCode = env.FAMILY_CODE || '';
  if (!familyCode) {
    return json({ error: 'Family code is not configured yet.' }, { status: 500 });
  }

  if (code.trim().toLowerCase() !== familyCode.toLowerCase()) {
    return json({ error: 'That\u2019s not the right family code.' }, { status: 403 });
  }

  const member = await env.DB.prepare(
    'SELECT id, name, profile_complete FROM members WHERE lower(username) = ?'
  ).bind(username.trim().toLowerCase()).first();

  if (!member) {
    return json({ error: 'No account with that username. First time? Use "Join the family" instead.' }, { status: 404 });
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionId = generateSessionId();
  const sessionExpires = now + 60 * 60 * 24 * 30;

  await env.DB.prepare(
    'INSERT INTO sessions (id, member_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, member.id, sessionExpires).run();

  return json({ ok: true, name: member.name, needs_setup: !member.profile_complete }, {
    headers: { 'Set-Cookie': setSessionCookie(sessionId) }
  });
}
