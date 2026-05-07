// Welcome page — first-touch experience for an invited family member.

const $ = (sel) => document.querySelector(sel);

const EMOJIS = [
  '✨','🌱','🌿','🌻','🪴','🌷','🌹','🌼',
  '🦋','🐝','🐞','🐢','🐰','🦊','🐻','🦉',
  '🌟','☀️','🌙','⭐','🔥','💫','🌈','☁️',
  '🛡️','🗝️','📖','🎵','🎨','🎯','⚓','🪶'
];

const params = new URLSearchParams(window.location.search);
const token = params.get('token');

let selectedEmoji = '🌱';

(async () => {
  if (!token) return showError('No invitation token. Make sure you used the link from your email.');

  try {
    const res = await fetch('/api/invites/accept?token=' + encodeURIComponent(token));
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return showError(errorText(data.error));
    }
    const invite = await res.json();
    showWelcome(invite);
  } catch (e) {
    showError('Could not load your invitation. Try again?');
  }
})();

function errorText(code) {
  return ({
    invite_not_found: 'We couldn\u2019t find that invitation.',
    invite_already_used: 'That invitation was already accepted. Try signing in instead.',
    invite_expired: 'That invitation has expired. Ask whoever invited you for a new one.'
  })[code] || 'Something went sideways with that invitation.';
}

function showError(text) {
  $('#loading').classList.add('hidden');
  $('#welcome').classList.add('hidden');
  $('#error').classList.remove('hidden');
  $('#error-text').textContent = text;
}

function showWelcome(invite) {
  $('#loading').classList.add('hidden');
  $('#welcome').classList.remove('hidden');

  $('#welcome-name').textContent = invite.name;
  $('#name-input').value = invite.name;
  $('#welcome-sub').innerHTML = `${escapeHtml(invite.invited_by_name)} invited you in. Pick an emoji and step inside.`;

  // Render emoji grid
  const grid = $('#emoji-grid');
  EMOJIS.forEach((e, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'emoji-btn' + (i === 0 ? ' selected' : '');
    btn.textContent = e;
    btn.addEventListener('click', () => {
      document.querySelectorAll('.emoji-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedEmoji = e;
    });
    grid.appendChild(btn);
  });
  selectedEmoji = EMOJIS[0];

  $('#welcome-form').addEventListener('submit', submit);
}

async function submit(e) {
  e.preventDefault();
  const name = $('#name-input').value.trim();
  if (!name) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Stepping inside\u2026';

  try {
    const res = await fetch('/api/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name, avatar_emoji: selectedEmoji })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showError(errorText(data.error) || data.error || 'Could not accept the invitation.');
      return;
    }
    const data = await res.json();
    window.location.href = data.redirect || '/';
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Enter the family';
    showError('Network trouble. Try again?');
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
