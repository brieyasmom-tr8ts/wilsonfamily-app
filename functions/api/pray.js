// POST /api/pray — mark "I prayed for this"
// Body: { prayer_id }

import { getCurrentMember, json, badRequest, unauthorized } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { prayer_id } = body;
  if (!prayer_id) return badRequest('Prayer ID required');

  await env.DB.prepare(
    'INSERT OR IGNORE INTO prayer_responses (prayer_id, member_id) VALUES (?, ?)'
  ).bind(prayer_id, member.id).run();

  return json({ ok: true });
}
