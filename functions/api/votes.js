// POST /api/votes — cast or update a vote on a suggestion
// Body: { suggestion_id, vote } where vote is 'yes' or 'pass'

import { getCurrentMember, json, badRequest, unauthorized } from '../_lib.js';

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { suggestion_id, vote } = body;
  if (!suggestion_id) return badRequest('Suggestion ID is required');
  if (!['yes', 'pass'].includes(vote)) return badRequest('Vote must be yes or pass');

  // Verify suggestion exists and is open
  const suggestion = await env.DB.prepare(
    'SELECT status FROM suggestions WHERE id = ?'
  ).bind(suggestion_id).first();

  if (!suggestion) return badRequest('Suggestion not found');
  if (suggestion.status !== 'open') return badRequest('Voting is closed on this suggestion');

  // Upsert vote
  await env.DB.prepare(`
    INSERT INTO votes (suggestion_id, member_id, vote)
    VALUES (?, ?, ?)
    ON CONFLICT(suggestion_id, member_id) DO UPDATE SET vote = excluded.vote
  `).bind(suggestion_id, member.id, vote).run();

  return json({ ok: true });
}
