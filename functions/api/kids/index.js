// GET  /api/kids — public list of kid members (id, name, emoji) for the tile grid
// POST /api/kids — parent-only: create a kid member with name, emoji, 4-digit PIN

import { getCurrentMember, hashPin, json, badRequest, unauthorized, forbidden } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  // Public endpoint — no auth required (the kids page needs it before sign-in)
  const kids = await env.DB.prepare(
    "SELECT id, name, avatar_emoji FROM members WHERE pin_hash IS NOT NULL ORDER BY name"
  ).all();

  return json({ kids: kids.results || [] });
}

export async function onRequestPost({ request, env }) {
  const me = await getCurrentMember(request, env);
  if (!me) return unauthorized();
  if (me.role !== 'parent') return forbidden('Only parents can add kids');

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid request body');
  }

  const { name, pin, avatar_emoji } = body;
  if (!name || !name.trim()) return badRequest('Name is required');
  if (!pin || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return badRequest('PIN must be exactly 4 digits');

  const emoji = avatar_emoji || '🌱';
  const pinHash = await hashPin(pin);

  // Kids get a placeholder email since the column is NOT NULL UNIQUE
  // Use a deterministic internal address that won't collide
  const placeholder = `kid-${Date.now()}-${Math.floor(Math.random() * 10000)}@family.internal`;

  await env.DB.prepare(
    'INSERT INTO members (name, email, role, avatar_emoji, pin_hash) VALUES (?, ?, ?, ?, ?)'
  ).bind(name.trim(), placeholder, 'member', emoji, pinHash).run();

  return json({ ok: true });
}
