// POST /api/auth/pin
// Kid PIN sign-in: { member_id, pin }
// Rate-limited: 5 failed attempts per 15 minutes

import { generateSessionId, setSessionCookie, verifyPin, json, badRequest, tooManyRequests } from '../../_lib.js';

const MAX_ATTEMPTS = 5;
const WINDOW_SECONDS = 15 * 60; // 15 minutes

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid request body');
  }

  const { member_id, pin } = body;
  if (!member_id || !pin) return badRequest('Member and PIN are required');
  if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return badRequest('PIN must be 4 digits');

  const memberId = parseInt(member_id, 10);
  if (isNaN(memberId)) return badRequest('Invalid member');

  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - WINDOW_SECONDS;

  // Check rate limit
  const attempts = await env.DB.prepare(
    'SELECT COUNT(*) as cnt FROM pin_attempts WHERE member_id = ? AND attempted_at > ? AND success = 0'
  ).bind(memberId, windowStart).first();

  if (attempts && attempts.cnt >= MAX_ATTEMPTS) {
    return tooManyRequests('Too many wrong PINs. Wait 15 minutes and try again.');
  }

  // Look up member with a PIN set
  const member = await env.DB.prepare(
    'SELECT id, name, pin_hash FROM members WHERE id = ? AND pin_hash IS NOT NULL'
  ).bind(memberId).first();

  if (!member) return badRequest('No PIN login for this member');

  const valid = await verifyPin(pin, member.pin_hash);

  // Record attempt
  await env.DB.prepare(
    'INSERT INTO pin_attempts (member_id, attempted_at, success) VALUES (?, ?, ?)'
  ).bind(memberId, now, valid ? 1 : 0).run();

  if (!valid) {
    const remaining = MAX_ATTEMPTS - (attempts ? attempts.cnt + 1 : 1);
    return json(
      { error: remaining > 0 ? `Wrong PIN. ${remaining} tries left.` : 'Too many wrong PINs. Wait 15 minutes.' },
      { status: 401 }
    );
  }

  // Clean up old attempts on success
  await env.DB.prepare(
    'DELETE FROM pin_attempts WHERE member_id = ? AND attempted_at < ?'
  ).bind(memberId, now).run();

  // Create session
  const sessionId = generateSessionId();
  const sessionExpires = now + 60 * 60 * 24 * 30; // 30 days

  await env.DB.prepare(
    'INSERT INTO sessions (id, member_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, memberId, sessionExpires).run();

  return json({ ok: true, name: member.name }, {
    headers: { 'Set-Cookie': setSessionCookie(sessionId) }
  });
}
