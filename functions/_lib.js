// Shared auth helpers
// Used by all /api/* functions

export function generateToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function generateSessionId() {
  return generateToken();
}

export function getSessionCookie(request) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|; )gf_session=([^;]+)/);
  return match ? match[1] : null;
}

export function setSessionCookie(sessionId, maxAgeSeconds = 60 * 60 * 24 * 30) {
  return `gf_session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie() {
  return `gf_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getCurrentMember(request, env) {
  const sessionId = getSessionCookie(request);
  if (!sessionId) return null;

  const now = Math.floor(Date.now() / 1000);
  const result = await env.DB.prepare(`
    SELECT m.id, m.name, m.email, m.role, m.avatar_emoji
    FROM sessions s
    JOIN members m ON m.id = s.member_id
    WHERE s.id = ? AND s.expires_at > ?
  `).bind(sessionId, now).first();

  return result || null;
}

export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
}

export function unauthorized() {
  return json({ error: 'Not signed in' }, { status: 401 });
}

export function forbidden(message = 'Not allowed') {
  return json({ error: message }, { status: 403 });
}

export function badRequest(message) {
  return json({ error: message }, { status: 400 });
}
