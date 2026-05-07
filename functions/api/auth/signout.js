// POST /api/auth/signout
import { getSessionCookie, clearSessionCookie, json } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const sessionId = getSessionCookie(request);
  if (sessionId) {
    await env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': clearSessionCookie()
    }
  });
}
