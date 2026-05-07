// POST /api/kids/reset-pin — parent-only: reset a kid's PIN
// Body: { member_id, pin }

import { getCurrentMember, hashPin, json, badRequest, unauthorized, forbidden } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const me = await getCurrentMember(request, env);
  if (!me) return unauthorized();
  if (me.role !== 'parent') return forbidden('Only parents can reset PINs');

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid request body');
  }

  const { member_id, pin } = body;
  if (!member_id) return badRequest('Member ID is required');
  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return badRequest('PIN must be exactly 4 digits');

  const memberId = parseInt(member_id, 10);
  if (isNaN(memberId)) return badRequest('Invalid member ID');

  // Verify this is actually a kid (has pin_hash)
  const member = await env.DB.prepare(
    'SELECT id FROM members WHERE id = ? AND pin_hash IS NOT NULL'
  ).bind(memberId).first();

  if (!member) return badRequest('Member not found or not a kid account');

  const pinHash = await hashPin(pin);

  await env.DB.batch([
    env.DB.prepare('UPDATE members SET pin_hash = ? WHERE id = ?').bind(pinHash, memberId),
    // Clear failed attempts so they're not locked out
    env.DB.prepare('DELETE FROM pin_attempts WHERE member_id = ?').bind(memberId)
  ]);

  return json({ ok: true });
}
