// DELETE /api/invites/revoke — cancel a pending invite
// Body: { id }

import { getCurrentMember, json, unauthorized, forbidden, badRequest } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  const me = await getCurrentMember(request, env);
  if (!me) return unauthorized();
  if (me.role !== 'parent') return forbidden('Only parents can revoke invites');

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const id = parseInt(body.id, 10);
  if (!id) return badRequest('Missing invite id');

  await env.DB.prepare('DELETE FROM invites WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
