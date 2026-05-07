// POST /api/auth/request-link
// Body: { email, next? }
// Sends a magic link if the email matches a known family member.
// `next` is the path the user should land on after verification (e.g. "/generosity/").

import { generateToken, json, badRequest } from '../../_lib.js';

export async function onRequestPost({ request, env }) {
  let body;
  try {
    body = await request.json();
  } catch {
    return badRequest('Invalid JSON');
  }

  const email = (body.email || '').trim().toLowerCase();
  const next = sanitizeNext(body.next);
  if (!email || !email.includes('@')) {
    return badRequest('Please enter a valid email');
  }

  // Look up member - but always return success to avoid leaking who's in the family
  const member = await env.DB.prepare(
    'SELECT id, name FROM members WHERE lower(email) = ?'
  ).bind(email).first();

  if (member) {
    const token = generateToken();
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 15; // 15 minutes

    // Stash next path in the magic_tokens row (we'll add the column in schema v2)
    // For backward compat, fall back gracefully if column doesn't exist.
    try {
      await env.DB.prepare(
        'INSERT INTO magic_tokens (token, email, expires_at, next_path) VALUES (?, ?, ?, ?)'
      ).bind(token, email, expiresAt, next).run();
    } catch {
      await env.DB.prepare(
        'INSERT INTO magic_tokens (token, email, expires_at) VALUES (?, ?, ?)'
      ).bind(token, email, expiresAt).run();
    }

    const link = `${env.APP_URL}/api/auth/verify?token=${token}`;

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
            From: env.FROM_EMAIL || 'fund@yourdomain.com',
            To: email,
            Subject: 'Your sign-in link 🌱',
            HtmlBody: magicLinkEmail(member.name, link),
            TextBody: `Hi ${member.name},\n\nTap this link to sign in to The Wilson Family:\n\n${link}\n\nThis link expires in 15 minutes.`,
            MessageStream: 'outbound'
          })
        });
        if (!res.ok) {
          const errBody = await res.text();
          console.error('Postmark send failed:', res.status, errBody);
        }
      } catch (e) {
        console.error('Email send failed:', e);
      }
    } else {
      console.log(`[DEV] Magic link for ${email}: ${link}`);
    }
  }

  return json({ ok: true, message: 'Check your email for a sign-in link.' });
}

// Only allow internal paths (prevents open-redirect)
function sanitizeNext(n) {
  if (!n || typeof n !== 'string') return '/';
  if (!n.startsWith('/')) return '/';
  if (n.startsWith('//')) return '/';
  if (n.length > 200) return '/';
  return n;
}

function magicLinkEmail(name, link) {
  return `
    <div style="font-family: Georgia, serif; max-width: 520px; margin: 0 auto; padding: 32px; color: #2a2a2a; background: #f7f1e3;">
      <div style="text-align: center; color: #b8853c; font-size: 24px; margin-bottom: 8px;">&#10022;</div>
      <h1 style="font-size: 28px; color: #1f3d2b; margin-bottom: 8px; text-align: center; font-weight: 400;">Hi ${name} &#128075;</h1>
      <p style="font-size: 16px; line-height: 1.6; text-align: center;">Tap the button below to sign in to The Wilson Family.</p>
      <div style="margin: 32px 0; text-align: center;">
        <a href="${link}" style="background: #1f3d2b; color: #f7f1e3; padding: 14px 28px; text-decoration: none; border-radius: 999px; font-size: 16px; display: inline-block; font-family: Georgia, serif;">Sign in</a>
      </div>
      <p style="font-size: 13px; color: #777; text-align: center; font-style: italic;">This link expires in 15 minutes. If you didn&rsquo;t request it, you can safely ignore this email.</p>
    </div>
  `;
}
