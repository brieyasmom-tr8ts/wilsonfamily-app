// POST /api/disburse — admin: record a disbursement (money sent out)
// Marks suggestion as 'disbursed', creates disbursement record, deducts from pot

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();
  if (member.role !== 'admin' && member.role !== 'parent') {
    return forbidden('Only parents/admins can disburse');
  }

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { suggestion_id, amount_cents, method, method_note } = body;
  if (!suggestion_id) return badRequest('Suggestion ID is required');

  const cents = Math.round(Number(amount_cents));
  if (!Number.isFinite(cents) || cents <= 0) return badRequest('Amount must be positive');
  if (!method) return badRequest('Method is required (Venmo, check, cash, etc.)');

  // Verify suggestion exists and is approved
  const suggestion = await env.DB.prepare(
    'SELECT id, status FROM suggestions WHERE id = ?'
  ).bind(suggestion_id).first();

  if (!suggestion) return badRequest('Suggestion not found');
  if (suggestion.status !== 'approved') return badRequest('Suggestion must be approved first');

  const now = Math.floor(Date.now() / 1000);

  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO disbursements (suggestion_id, amount_cents, method, method_note, disbursed_at, recorded_by) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(suggestion_id, cents, method, (method_note || '').trim() || null, now, member.id),
    env.DB.prepare(
      "UPDATE suggestions SET status = 'disbursed' WHERE id = ?"
    ).bind(suggestion_id)
  ]);

  return json({ ok: true });
}
