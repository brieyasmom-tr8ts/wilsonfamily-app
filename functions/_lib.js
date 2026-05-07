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
    SELECT m.id, m.name, m.email, m.role, m.avatar_emoji,
           m.username, m.birthday, m.anniversary, m.profile_complete
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

export function tooManyRequests(message = 'Too many attempts. Try again later.') {
  return json({ error: message }, { status: 429 });
}

// --- PIN hashing (PBKDF2 via Web Crypto, Workers-compatible) ---

export async function hashPin(pin) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  const hash = new Uint8Array(bits);
  const saltHex = Array.from(salt, b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = Array.from(hash, b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

export async function verifyPin(pin, stored) {
  if (!stored || !pin) return false;
  const [saltHex, expectedHex] = stored.split(':');
  if (!saltHex || !expectedHex) return false;
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    key,
    256
  );
  const hashHex = Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, '0')).join('');
  return hashHex === expectedHex;
}
