// GET /api/pot - returns balance + contribution history
// POST /api/pot - record a contribution

import { getCurrentMember, json, unauthorized, badRequest, forbidden } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  // Total contributed
  const contribResult = await env.DB.prepare(
    'SELECT COALESCE(SUM(amount_cents), 0) AS total FROM contributions'
  ).first();

  // Total disbursed
  const disbursedResult = await env.DB.prepare(
    'SELECT COALESCE(SUM(amount_cents), 0) AS total FROM disbursements'
  ).first();

  // Recent contributions
  const recent = await env.DB.prepare(`
    SELECT c.id, c.amount_cents, c.kind, c.note, c.created_at,
           m.name AS member_name, m.avatar_emoji
    FROM contributions c
    JOIN members m ON m.id = c.member_id
    ORDER BY c.created_at DESC
    LIMIT 20
  `).all();

  const balance_cents = (contribResult.total || 0) - (disbursedResult.total || 0);

  return json({
    balance_cents,
    total_contributed_cents: contribResult.total || 0,
    total_disbursed_cents: disbursedResult.total || 0,
    recent_contributions: recent.results || []
  });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const amount_cents = Math.round(Number(body.amount_cents));
  const kind = body.kind || 'one-time';
  const note = (body.note || '').trim().slice(0, 500) || null;

  if (!Number.isFinite(amount_cents) || amount_cents <= 0) {
    return badRequest('Amount must be positive');
  }

  // Only parents can record monthly allocations
  if (kind === 'monthly-allocation' && member.role !== 'parent' && member.role !== 'admin') {
    return forbidden('Only parents can record monthly allocations');
  }

  const result = await env.DB.prepare(
    'INSERT INTO contributions (member_id, amount_cents, kind, note) VALUES (?, ?, ?, ?)'
  ).bind(member.id, amount_cents, kind, note).run();

  return json({ ok: true, id: result.meta.last_row_id });
}

// PUT /api/pot — admin edit a contribution
export async function onRequestPut({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();
  if (member.role !== 'admin') return forbidden('Admin access required');

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id, amount_cents, kind, note } = body;
  if (!id) return badRequest('Contribution ID is required');

  const sets = [];
  const vals = [];
  if (amount_cents !== undefined) {
    const cents = Math.round(Number(amount_cents));
    if (!Number.isFinite(cents) || cents <= 0) return badRequest('Amount must be positive');
    sets.push('amount_cents = ?'); vals.push(cents);
  }
  if (kind !== undefined) { sets.push('kind = ?'); vals.push(kind); }
  if (note !== undefined) { sets.push('note = ?'); vals.push(note || null); }

  if (sets.length === 0) return badRequest('Nothing to update');

  vals.push(id);
  await env.DB.prepare(`UPDATE contributions SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();

  return json({ ok: true });
}

// DELETE /api/pot — admin delete a contribution
export async function onRequestDelete({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();
  if (member.role !== 'admin') return forbidden('Admin access required');

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id } = body;
  if (!id) return badRequest('Contribution ID is required');

  await env.DB.prepare('DELETE FROM contributions WHERE id = ?').bind(id).run();

  return json({ ok: true });
}
