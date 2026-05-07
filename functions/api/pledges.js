// GET  /api/pledges — get my pledge (or all for admin)
// POST /api/pledges — create/update my monthly pledge
// PUT  /api/pledges — admin: record all active pledges for current month

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  // Get my pledge
  const myPledge = await env.DB.prepare(
    'SELECT id, amount_cents, active FROM pledges WHERE member_id = ? AND active = 1'
  ).bind(member.id).first();

  let allPledges = [];
  if (member.role === 'admin') {
    const result = await env.DB.prepare(`
      SELECT p.id, p.amount_cents, p.active, p.last_recorded_month, p.created_at,
             m.name, m.avatar_emoji
      FROM pledges p
      JOIN members m ON m.id = p.member_id
      WHERE p.active = 1
      ORDER BY m.name
    `).all();
    allPledges = result.results || [];
  }

  return json({ my_pledge: myPledge || null, all_pledges: allPledges });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { amount_cents, cancel } = body;

  // Cancel existing pledge
  if (cancel) {
    await env.DB.prepare(
      'UPDATE pledges SET active = 0 WHERE member_id = ? AND active = 1'
    ).bind(member.id).run();
    return json({ ok: true, cancelled: true });
  }

  const cents = Math.round(Number(amount_cents));
  if (!Number.isFinite(cents) || cents <= 0) return badRequest('Amount must be positive');

  // Deactivate old pledge if any
  await env.DB.prepare(
    'UPDATE pledges SET active = 0 WHERE member_id = ? AND active = 1'
  ).bind(member.id).run();

  // Create new pledge
  await env.DB.prepare(
    'INSERT INTO pledges (member_id, amount_cents) VALUES (?, ?)'
  ).bind(member.id, cents).run();

  return json({ ok: true });
}

// PUT /api/pledges — admin: record all pledges for current month
export async function onRequestPut({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();
  if (member.role !== 'admin') return forbidden('Admin only');

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Get all active pledges not yet recorded for this month
  const pledges = await env.DB.prepare(
    "SELECT p.id, p.member_id, p.amount_cents FROM pledges p WHERE p.active = 1 AND (p.last_recorded_month IS NULL OR p.last_recorded_month != ?)"
  ).bind(currentMonth).all();

  const toRecord = pledges.results || [];
  let recorded = 0;

  for (const p of toRecord) {
    await env.DB.prepare(
      "INSERT INTO contributions (member_id, amount_cents, kind, note) VALUES (?, ?, 'monthly-allocation', 'Monthly recurring pledge')"
    ).bind(p.member_id, p.amount_cents).run();

    await env.DB.prepare(
      'UPDATE pledges SET last_recorded_month = ? WHERE id = ?'
    ).bind(currentMonth, p.id).run();

    recorded++;
  }

  return json({ ok: true, recorded, month: currentMonth });
}
