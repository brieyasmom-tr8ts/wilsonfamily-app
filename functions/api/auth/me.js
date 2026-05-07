// GET /api/auth/me
import { getCurrentMember, json, unauthorized } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();
  return json({ member });
}
