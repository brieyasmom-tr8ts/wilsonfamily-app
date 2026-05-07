// GET /api/auth/verify?token=...
// Consumes the magic token, creates a session, redirects to the path stored on the token (or /).
// On error, redirects to /signin/?error=... preserving the next param.

import { generateSessionId, setSessionCookie } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token');

  if (!token) {
    return redirectToSignin(env, 'missing_token');
  }

  const now = Math.floor(Date.now() / 1000);

  // Try to read with next_path; fall back if column missing
  let tokenRow;
  try {
    tokenRow = await env.DB.prepare(
      'SELECT email, expires_at, used_at, next_path FROM magic_tokens WHERE token = ?'
    ).bind(token).first();
  } catch {
    tokenRow = await env.DB.prepare(
      'SELECT email, expires_at, used_at FROM magic_tokens WHERE token = ?'
    ).bind(token).first();
  }

  if (!tokenRow) return redirectToSignin(env, 'bad_token');
  if (tokenRow.used_at) return redirectToSignin(env, 'token_used', tokenRow.next_path);
  if (tokenRow.expires_at < now) return redirectToSignin(env, 'token_expired', tokenRow.next_path);

  const member = await env.DB.prepare(
    'SELECT id FROM members WHERE lower(email) = ?'
  ).bind(tokenRow.email.toLowerCase()).first();

  if (!member) return redirectToSignin(env, 'no_member', tokenRow.next_path);

  const sessionId = generateSessionId();
  const sessionExpires = now + 60 * 60 * 24 * 30; // 30 days

  await env.DB.batch([
    env.DB.prepare('UPDATE magic_tokens SET used_at = ? WHERE token = ?').bind(now, token),
    env.DB.prepare(
      'INSERT INTO sessions (id, member_id, expires_at) VALUES (?, ?, ?)'
    ).bind(sessionId, member.id, sessionExpires)
  ]);

  const next = sanitizeNext(tokenRow.next_path) || '/';
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${env.APP_URL}${next}`,
      'Set-Cookie': setSessionCookie(sessionId)
    }
  });
}

function redirectToSignin(env, error, next) {
  const params = new URLSearchParams();
  params.set('error', error);
  if (next) params.set('next', sanitizeNext(next));
  return Response.redirect(`${env.APP_URL}/signin/?${params}`, 302);
}

function sanitizeNext(n) {
  if (!n || typeof n !== 'string') return '/';
  if (!n.startsWith('/')) return '/';
  if (n.startsWith('//')) return '/';
  if (n.length > 200) return '/';
  return n;
}
