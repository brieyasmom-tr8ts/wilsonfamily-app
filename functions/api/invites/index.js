// GET  /api/invites — list all members and pending invites (parents only)
// POST /api/invites — create + send a new invite (parents only)

import { getCurrentMember, generateToken, json, unauthorized, forbidden, badRequest } from '../../_lib.js';

export async function onRequestGet({ request, env }) {
  const me = await getCurrentMember(request, env);
  if (!me) return unauthorized();
  if (me.role !== 'parent') return forbidden('Only parents can see the family page');

  const members = await env.DB.prepare(`
    SELECT id, name, email, role, avatar_emoji, created_at
    FROM members
    ORDER BY role DESC, created_at ASC
  `).all();

  const now = Math.floor(Date.now() / 1000);
  const pending = await env.DB.prepare(`
    SELECT i.id, i.email, i.name, i.role, i.expires_at, i.created_at,
           m.name AS invited_by_name
    FROM invites i
    JOIN members m ON m.id = i.invited_by
    WHERE i.accepted_at IS NULL AND i.expires_at > ?
    ORDER BY i.created_at DESC
  `).bind(now).all();

  return json({
    members: members.results || [],
    pending_invites: pending.results || []
  });
}

export async function onRequestPost({ request, env }) {
  const me = await getCurrentMember(request, env);
  if (!me) return unauthorized();
  if (me.role !== 'parent') return forbidden('Only parents can send invites');

  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const name = (body.name || '').trim().slice(0, 80);
  const email = (body.email || '').trim().toLowerCase().slice(0, 200);
  const role = body.role === 'parent' ? 'parent' : 'member';

  if (!name) return badRequest('Please provide a name');
  if (!email || !email.includes('@')) return badRequest('Please provide a valid email');

  // Check if already a member
  const existing = await env.DB.prepare(
    'SELECT id FROM members WHERE lower(email) = ?'
  ).bind(email).first();
  if (existing) return badRequest('Someone with that email is already in the family');

  // Check if there's already a pending invite for this email
  const now = Math.floor(Date.now() / 1000);
  const pendingInvite = await env.DB.prepare(
    'SELECT id FROM invites WHERE lower(email) = ? AND accepted_at IS NULL AND expires_at > ?'
  ).bind(email, now).first();
  if (pendingInvite) return badRequest('There\'s already a pending invite for that email');

  const token = generateToken();
  const expiresAt = now + 60 * 60 * 24 * 14; // 14 days

  await env.DB.prepare(
    'INSERT INTO invites (token, email, name, role, invited_by, expires_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(token, email, name, role, me.id, expiresAt).run();

  const link = `${env.APP_URL}/welcome/?token=${token}`;

  // Send invite email via Postmark
  if (env.POSTMARK_API_KEY) {
    try {
      const res = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Postmark-Server-Token': env.POSTMARK_API_KEY
        },
        body: JSON.stringify({
          From: env.FROM_EMAIL || 'hello@wilsonfamily.app',
          To: email,
          Subject: `${me.name} invited you to The Wilson Family ✨`,
          HtmlBody: inviteEmail(name, me.name, link),
          TextBody: `Hi ${name},\n\n${me.name} invited you to join The Wilson Family — our shared little corner of the internet.\n\nClick this link to accept and set up your profile:\n\n${link}\n\nThis invite expires in 14 days.`,
          MessageStream: 'outbound'
        })
      });
      if (!res.ok) {
        const errBody = await res.text();
        console.error('Postmark invite send failed:', res.status, errBody);
      }
    } catch (e) {
      console.error('Invite email send failed:', e);
    }
  } else {
    console.log(`[DEV] Invite link for ${email}: ${link}`);
  }

  return json({ ok: true, message: `Invite sent to ${name}.` });
}

function inviteEmail(name, inviterName, link) {
  return `
    <div style="font-family: Georgia, serif; max-width: 540px; margin: 0 auto; padding: 40px 32px; color: #2a2a2a; background: #f7f1e3; border-radius: 8px;">
      <div style="text-align: center; color: #b8853c; font-size: 28px; margin-bottom: 16px;">&#10022;</div>
      <p style="font-size: 11px; font-weight: 600; letter-spacing: 0.22em; text-transform: uppercase; color: #b8853c; text-align: center; margin-bottom: 16px;">An invitation</p>
      <h1 style="font-size: 32px; color: #1f3d2b; margin: 0 0 24px; text-align: center; font-weight: 400; line-height: 1.1;">
        Welcome <em style="color: #b8853c;">home</em>, ${name}.
      </h1>
      <p style="font-size: 16px; line-height: 1.7; text-align: center; margin-bottom: 8px;">${inviterName} has invited you to The Wilson Family &mdash;</p>
      <p style="font-size: 14px; line-height: 1.6; text-align: center; color: #4a5650; font-style: italic; margin-bottom: 32px;">
        a shared little corner of the internet, just for us.
      </p>
      <div style="margin: 32px 0; text-align: center;">
        <a href="${link}" style="background: #1f3d2b; color: #f7f1e3; padding: 16px 32px; text-decoration: none; border-radius: 999px; font-size: 16px; display: inline-block; font-family: Georgia, serif;">Accept &amp; set up your profile</a>
      </div>
      <p style="font-size: 13px; color: #777; text-align: center; font-style: italic; margin-top: 32px;">This invitation expires in 14 days. If you weren&rsquo;t expecting it, you can safely ignore this email.</p>
    </div>
  `;
}
