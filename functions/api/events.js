// GET    /api/events — list events for a date range (plus auto birthdays/anniversaries)
// POST   /api/events — create a custom event
// PUT    /api/events — edit an event (owner or admin)
// DELETE /api/events — delete an event (owner or admin)

import { getCurrentMember, json, badRequest, unauthorized, forbidden } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  const url = new URL(request.url);
  const year = parseInt(url.searchParams.get('year')) || new Date().getFullYear();
  const month = parseInt(url.searchParams.get('month')) || (new Date().getMonth() + 1);

  // Pad month
  const mm = String(month).padStart(2, '0');
  const startDate = `${year}-${mm}-01`;
  const endDate = `${year}-${mm}-31`;

  // Custom events that overlap this month (multi-day events count if any day falls in range)
  const events = await env.DB.prepare(`
    SELECT e.id, e.title, e.description, e.event_date, e.end_date, e.recurring, e.color,
           e.created_by, m.name AS created_by_name
    FROM events e
    JOIN members m ON m.id = e.created_by
    WHERE (e.event_date <= ? AND COALESCE(e.end_date, e.event_date) >= ?)
       OR (e.recurring = 'yearly' AND substr(e.event_date, 6) BETWEEN substr(?, 6) AND substr(?, 6))
    ORDER BY e.event_date
  `).bind(endDate, startDate, startDate, endDate).all();

  // Birthdays and anniversaries from members
  const members = await env.DB.prepare(
    'SELECT id, name, avatar_emoji, birthday, anniversary FROM members WHERE birthday IS NOT NULL OR anniversary IS NOT NULL'
  ).all();

  const autoEvents = [];
  // Group anniversaries by exact date so couples share one event.
  const anniversaryGroups = new Map();

  for (const m of (members.results || [])) {
    if (m.birthday) {
      const bday = m.birthday; // YYYY-MM-DD
      const bdayMM = bday.slice(5, 7);
      if (bdayMM === mm) {
        const birthYear = parseInt(bday.slice(0, 4));
        const age = year - birthYear;
        autoEvents.push({
          id: `bday-${m.id}`,
          title: `${m.avatar_emoji || '🎂'} ${m.name}'s Birthday`,
          description: age > 0 ? `Turning ${age}!` : null,
          event_date: `${year}-${bday.slice(5)}`,
          color: '#f59e0b',
          type: 'birthday',
          member_id: m.id
        });
      }
    }
    if (m.anniversary) {
      const anniv = m.anniversary;
      const annivMM = anniv.slice(5, 7);
      if (annivMM === mm) {
        // Group by MM-DD so a couple shares one event even if their
        // stored anniversary years differ (one may not know exact year).
        const key = anniv.slice(5);
        if (!anniversaryGroups.has(key)) anniversaryGroups.set(key, []);
        anniversaryGroups.get(key).push(m);
      }
    }
  }

  for (const [mmdd, group] of anniversaryGroups) {
    // Use the earliest year in the group for "X years!" — most likely the wedding year.
    const earliestYear = Math.min(...group.map(g => parseInt(g.anniversary.slice(0, 4))));
    const years = year - earliestYear;
    const names = group.length === 1
      ? `${group[0].name}'s`
      : group.length === 2
        ? `${group[0].name} & ${group[1].name}'s`
        : group.slice(0, -1).map(m => m.name).join(', ') + ` & ${group[group.length - 1].name}'s`;
    autoEvents.push({
      id: `anniv-${group.map(m => m.id).join('-')}`,
      title: `💍 ${names} Anniversary`,
      description: years > 0 ? `${years} years!` : null,
      event_date: `${year}-${mmdd}`,
      color: '#ef4444',
      type: 'anniversary',
      member_ids: group.map(m => m.id)
    });
  }

  return json({
    events: (events.results || []).map(e => ({ ...e, type: 'custom' })),
    auto_events: autoEvents,
    year,
    month
  });
}

export async function onRequestPost({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { title, description, event_date, end_date, recurring, color } = body;
  if (!title || !title.trim()) return badRequest('Title is required');
  if (!event_date) return badRequest('Date is required');

  const validRecurring = ['yearly', 'monthly', null];
  const rec = validRecurring.includes(recurring) ? recurring : null;

  await env.DB.prepare(
    'INSERT INTO events (title, description, event_date, end_date, recurring, color, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(title.trim(), (description || '').trim() || null, event_date, end_date || null, rec, color || '#2563eb', member.id).run();

  return json({ ok: true });
}

export async function onRequestPut({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id, title, description, event_date, end_date, recurring, color } = body;
  if (!id) return badRequest('Event ID is required');

  const event = await env.DB.prepare('SELECT created_by FROM events WHERE id = ?').bind(id).first();
  if (!event) return badRequest('Event not found');
  if (event.created_by !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  const sets = [];
  const vals = [];
  if (title !== undefined) { sets.push('title = ?'); vals.push(title.trim()); }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description.trim() || null); }
  if (event_date !== undefined) { sets.push('event_date = ?'); vals.push(event_date); }
  if (end_date !== undefined) { sets.push('end_date = ?'); vals.push(end_date || null); }
  if (recurring !== undefined) { sets.push('recurring = ?'); vals.push(recurring || null); }
  if (color !== undefined) { sets.push('color = ?'); vals.push(color); }

  if (sets.length === 0) return badRequest('Nothing to update');
  vals.push(id);

  await env.DB.prepare(`UPDATE events SET ${sets.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
}

export async function onRequestDelete({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  let body;
  try { body = await request.json(); } catch { return badRequest('Invalid JSON'); }

  const { id } = body;
  if (!id) return badRequest('Event ID is required');

  const event = await env.DB.prepare('SELECT created_by FROM events WHERE id = ?').bind(id).first();
  if (!event) return badRequest('Event not found');
  if (event.created_by !== member.id && member.role !== 'admin') return forbidden('Not allowed');

  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
