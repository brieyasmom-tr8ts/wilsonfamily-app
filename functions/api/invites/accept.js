// GET  /api/invites/accept?token=...  — peek at the invite (welcome page renders this)
// POST /api/invites/accept              — finalize: create member + sign them in

import { generateSessionId, setSessionCookie, json, badRequest } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');
  if (!token) return badRequest('Missing token');

  const invite = await env.DB.prepare(`
    SELECT i.email, i.name, i.role, i.expires_at, i.accepted_at,
           m.name AS invited_by_name
    FROM invites i
    JOIN members m ON m.id = i.invited_by
    WHERE i.token = ?
  `).bind(token).first();

  if (!invite) return json({ error: 'invite_not_found' }, { status: 404 });
  if (invite.accepted_at) return json({ error: 'invite_already_used' }, { status: 410 });
  if (invite.expires_at < Math.floor(Date.now() / 1000)) {
    return json({ error: 'invite_expired' }, { status: 410 });
  }

  return json({
    name: invite.name,
    email: invite.email,
    role: invite.role,
    invited_by_name: invite.invited_by_name
  });
}

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const token = body.token;
  const chosenName = (body.name || '').trim().slice(0, 80);
  const chosenEmoji = (body.avatar_emoji || '🌱').slice(0, 8);
  if (!token) return badRequest('Missing token');
  if (!chosenName) return badRequest('Please confirm your name');

  const now = Math.floor(Date.now() / 1000);

  const invite = await env.DB.prepare(
    'SELECT email, role, expires_at, accepted_at FROM invites WHERE token = ?'
  ).bind(token).first();

  if (!invite) return json({ error: 'invite_not_found' }, { status: 404 });
  if (invite.accepted_at) return json({ error: 'invite_already_used' }, { status: 410 });
  if (invite.expires_at < now) return json({ error: 'invite_expired' }, { status: 410 });

  // Edge case: in case email already became a member somehow
  const existingMember = await env.DB.prepare(
    'SELECT id FROM members WHERE lower(email) = ?'
  ).bind(invite.email.toLowerCase()).first();

  let memberId;
  if (existingMember) {
    memberId = existingMember.id;
  } else {
    const insert = await env.DB.prepare(
      'INSERT INTO members (name, email, role, avatar_emoji) VALUES (?, ?, ?, ?)'
    ).bind(chosenName, invite.email, invite.role, chosenEmoji).run();
    memberId = insert.meta.last_row_id;
  }

  // Create session
  const sessionId = generateSessionId();
  const sessionExpires = now + 60 * 60 * 24 * 30;

  await env.DB.batch([
    env.DB.prepare('UPDATE invites SET accepted_at = ? WHERE token = ?').bind(now, token),
    env.DB.prepare(
      'INSERT INTO sessions (id, member_id, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionId, memberId, sessionExpires)
  ]);

  return new Response(JSON.stringify({ ok: true, redirect: '/' }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': setSessionCookie(sessionId)
    }
  });
}
