// GET /api/activity — recent activity across all rooms
// Returns the latest ~20 actions for the homepage feed

import { getCurrentMember, json, unauthorized } from '../_lib.js';

export async function onRequestGet({ request, env }) {
  const member = await getCurrentMember(request, env);
  if (!member) return unauthorized();

  // Pull recent activity from each table in parallel
  const [contributions, prayers, rocks, photos, suggestions, listItems] = await Promise.allSettled([
    env.DB.prepare(`
      SELECT 'contribution' AS type, c.created_at, c.amount_cents,
             m.name, m.avatar_emoji
      FROM contributions c JOIN members m ON m.id = c.member_id
      ORDER BY c.created_at DESC LIMIT 8
    `).all(),
    env.DB.prepare(`
      SELECT CASE WHEN p.answered = 1 THEN 'prayer_answered'
                  WHEN p.type = 'praise' THEN 'praise'
                  ELSE 'prayer' END AS type,
             p.created_at, p.content,
             m.name, m.avatar_emoji
      FROM prayers p JOIN members m ON m.id = p.posted_by
      ORDER BY p.created_at DESC LIMIT 8
    `).all(),
    env.DB.prepare(`
      SELECT 'rock' AS type, r.created_at, r.word,
             m.name, m.avatar_emoji
      FROM rocks r JOIN members m ON m.id = r.created_by
      ORDER BY r.created_at DESC LIMIT 8
    `).all(),
    env.DB.prepare(`
      SELECT 'photo' AS type, p.created_at, p.caption,
             m.name, m.avatar_emoji
      FROM photos p JOIN members m ON m.id = p.uploaded_by
      ORDER BY p.created_at DESC LIMIT 8
    `).all(),
    env.DB.prepare(`
      SELECT 'suggestion' AS type, s.created_at, s.recipient_name,
             m.name, m.avatar_emoji
      FROM suggestions s JOIN members m ON m.id = s.suggested_by
      ORDER BY s.created_at DESC LIMIT 5
    `).all(),
    env.DB.prepare(`
      SELECT 'list_item' AS type, li.created_at, li.text, l.title AS list_title,
             m.name, m.avatar_emoji
      FROM list_items li
      JOIN lists l ON l.id = li.list_id
      JOIN members m ON m.id = li.added_by
      ORDER BY li.created_at DESC LIMIT 5
    `).all(),
  ]);

  // Merge all results
  const items = [];
  const extract = (result) => {
    if (result.status === 'fulfilled' && result.value.results) {
      items.push(...result.value.results);
    }
  };
  extract(contributions);
  extract(prayers);
  extract(rocks);
  extract(photos);
  extract(suggestions);
  extract(listItems);

  // Sort by created_at descending, take top 20
  items.sort((a, b) => b.created_at - a.created_at);
  const feed = items.slice(0, 20);

  // Birthdays coming up (next 30 days)
  const allMembers = await env.DB.prepare(
    'SELECT name, avatar_emoji, birthday FROM members WHERE birthday IS NOT NULL'
  ).all();

  const now = new Date();
  const upcoming = [];
  for (const m of (allMembers.results || [])) {
    if (!m.birthday) continue;
    const [mm, dd] = parseBirthday(m.birthday);
    if (!mm || !dd) continue;
    const thisYear = new Date(now.getFullYear(), mm - 1, dd);
    let next = thisYear;
    if (thisYear < now && (thisYear.toDateString() !== now.toDateString())) {
      next = new Date(now.getFullYear() + 1, mm - 1, dd);
    }
    const daysAway = Math.ceil((next - now) / (1000 * 60 * 60 * 24));
    if (daysAway <= 30) {
      upcoming.push({ name: m.name, avatar_emoji: m.avatar_emoji, birthday: m.birthday, days_away: daysAway });
    }
  }
  upcoming.sort((a, b) => a.days_away - b.days_away);

  return json({ feed, birthdays: upcoming });
}

function parseBirthday(bday) {
  // Supports YYYY-MM-DD or MM-DD
  if (!bday) return [null, null];
  const parts = bday.split('-');
  if (parts.length === 3) return [parseInt(parts[1]), parseInt(parts[2])];
  if (parts.length === 2) return [parseInt(parts[0]), parseInt(parts[1])];
  return [null, null];
}
