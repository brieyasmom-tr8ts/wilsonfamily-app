// GET  /api/suggestions — list suggestions (with vote counts)
// POST /api/suggestions — create a suggestion
// PUT  /api/suggestions — admin approve/decline

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const url = new URL(request.url);
  const status = url.searchParams.get('status'); // 'open', 'approved', 'declined', 'disbursed', or null for all

  let query = `
    SELECT s.id, s.recipient_name, s.story, s.scripture, s.suggested_amount_cents,
           s.status, s.parent_decision_note, s.parent_decision_at, s.created_at, s.decision_needed_by,
           s.suggested_by, m.name AS suggested_by_name, m.avatar_emoji,
           dm.name AS decided_by_name,
           (SELECT COUNT(*) FROM votes v WHERE v.suggestion_id = s.id AND v.vote = 'yes') AS yes_count,
           (SELECT COUNT(*) FROM votes v WHERE v.suggestion_id = s.id AND v.vote = 'pass') AS pass_count,
           (SELECT v.vote FROM votes v WHERE v.suggestion_id = s.id AND v.member_id = ?) AS my_vote
    FROM suggestions s
    JOIN members m ON m.id = s.suggested_by
    LEFT JOIN members dm ON dm.id = s.parent_decision_by
  `;
  const binds = [member.id];

  if (status) {
    query += ' WHERE s.status = ?';
    binds.push(status);
  }

  query += ' ORDER BY s.created_at DESC';

  const results = await env.DB.prepare(query).bind(...binds).all();

  return json({ suggestions: results.results || [] });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { recipient_name, story, scripture, suggested_amount_cents, decision_needed_by } = body;
  if (!recipient_name || !recipient_name.trim()) return badRequest('Recipient name is required');
  if (!story || !story.trim()) return badRequest('Please share their story');

  const amount = suggested_amount_cents ? Math.round(Number(suggested_amount_cents)) : null;
  if (amount !== null && (!Number.isFinite(amount) || amount <= 0)) {
    return badRequest('Amount must be positive');
  }

  const result = await env.DB.prepare(
    'INSERT INTO suggestions (suggested_by, recipient_name, story, scripture, suggested_amount_cents, decision_needed_by) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(
    member.id,
    recipient_name.trim(),
    story.trim(),
    (scripture || '').trim() || null,
    amount,
    decision_needed_by || null
  ).run();

  return json({ ok: true, id: result.meta.last_row_id });
}

export async function onRequestPut({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();
  if (member.role !== 'admin' && member.role !== 'parent') {
    return forbidden('Only parents/admins can approve or decline');
  }

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id, status, note } = body;
  if (!id) return badRequest('Suggestion ID is required');

  const validStatuses = ['approved', 'declined'];
  if (!validStatuses.includes(status)) return badRequest('Status must be approved or declined');

  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    'UPDATE suggestions SET status = ?, parent_decision_by = ?, parent_decision_at = ?, parent_decision_note = ? WHERE id = ?'
  ).bind(status, member.id, now, (note || '').trim() || null, id).run();

  return json({ ok: true });
}
