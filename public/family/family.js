// Family management page (parents only)

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let me = null;

(async function boot() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.replace('/signin/?next=' + encodeURIComponent('/family/'));
      return;
    }
    const data = await res.json();
    me = data.member;
    if (me.role !== 'parent') {
      // Not a parent - send them home
      window.location.replace('/');
      return;
    }
    init();
  } catch (e) {
    window.location.replace('/signin/?next=' + encodeURIComponent('/family/'));
  }
})();

function init() {
  $('#user-name').textContent = me.name;
  $('#user-emoji').textContent = me.avatar_emoji || '🌱';

  $('#signout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/';
  });

  $('#invite-btn').addEventListener('click', openInviteModal);
  $$('#modal-invite [data-close]').forEach(el => el.addEventListener('click', closeInviteModal));
  $('#invite-form').addEventListener('submit', submitInvite);

  loadFamily();
}

async function loadFamily() {
  try {
    const res = await fetch('/api/invites');
    if (!res.ok) return;
    const data = await res.json();
    renderMembers(data.members);
    renderPending(data.pending_invites);
  } catch (e) { console.error(e); }
}

function renderMembers(members) {
  const list = $('#members-list');
  list.innerHTML = members.map(m => `
    <li class="member-row">
      <div class="member-avatar">${m.avatar_emoji || '🌱'}</div>
      <div class="member-body">
        <strong>${escapeHtml(m.name)}</strong>
        <div class="member-meta">
          <span class="role-pill ${m.role === 'parent' ? 'parent' : ''}">${m.role}</span>
          ${escapeHtml(m.email)}
        </div>
      </div>
      <div></div>
    </li>
  `).join('');
}

function renderPending(invites) {
  const section = $('#pending-section');
  const list = $('#pending-list');
  if (!invites || invites.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  list.innerHTML = invites.map(i => `
    <li class="member-row pending">
      <div class="member-avatar">…</div>
      <div class="member-body">
        <strong>${escapeHtml(i.name)}</strong>
        <div class="member-meta">
          <span class="role-pill ${i.role === 'parent' ? 'parent' : ''}">${i.role}</span>
          ${escapeHtml(i.email)} · invited ${timeAgo(i.created_at)}
        </div>
      </div>
      <button class="member-action" data-revoke="${i.id}">Revoke</button>
    </li>
  `).join('');

  list.querySelectorAll('[data-revoke]').forEach(btn => {
    btn.addEventListener('click', () => revokeInvite(parseInt(btn.dataset.revoke, 10)));
  });
}

async function revokeInvite(id) {
  if (!confirm('Revoke this invitation?')) return;
  await fetch('/api/invites/revoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  loadFamily();
}

function openInviteModal() {
  $('#modal-invite').classList.remove('hidden');
  $('#invite-error').classList.add('hidden');
  setTimeout(() => $('#invite-name').focus(), 100);
}

function closeInviteModal() {
  $('#modal-invite').classList.add('hidden');
  $('#invite-form').reset();
  $('#invite-error').classList.add('hidden');
}

async function submitInvite(e) {
  e.preventDefault();
  const name = $('#invite-name').value.trim();
  const email = $('#invite-email').value.trim();
  const role = $('#invite-role').value;

  const errEl = $('#invite-error');
  errEl.classList.add('hidden');

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Sending\u2026';

  try {
    const res = await fetch('/api/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Could not send the invite.';
      errEl.classList.remove('hidden');
      return;
    }
    closeInviteModal();
    loadFamily();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send the invite';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function timeAgo(unix) {
  const seconds = Math.floor(Date.now() / 1000) - unix;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
