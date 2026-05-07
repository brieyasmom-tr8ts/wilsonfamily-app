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
    if (me.role !== 'parent' && me.role !== 'admin') {
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

  $('#add-kid-btn').addEventListener('click', openKidModal);
  $$('[data-close-kid]').forEach(el => el.addEventListener('click', closeKidModal));
  $('#kid-form').addEventListener('submit', submitKid);

  $$('[data-close-reset]').forEach(el => el.addEventListener('click', closeResetPinModal));
  $('#reset-pin-form').addEventListener('submit', submitResetPin);

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
  list.innerHTML = members.map(m => {
    const isKid = m.email && m.email.endsWith('@family.internal');
    const metaText = isKid ? '<span class="kid-badge">PIN login</span>' : escapeHtml(m.email);
    const action = isKid
      ? `<button class="member-action reset-pin-btn" data-id="${m.id}" data-name="${escapeAttr(m.name)}">Reset PIN</button>`
      : '<div></div>';
    return `
    <li class="member-row">
      <div class="member-avatar">${m.avatar_emoji || '🌱'}</div>
      <div class="member-body">
        <strong>${escapeHtml(m.name)}</strong>
        <div class="member-meta">
          <span class="role-pill ${m.role === 'parent' ? 'parent' : ''}">${m.role}</span>
          ${metaText}
        </div>
      </div>
      ${action}
    </li>`;
  }).join('');

  list.querySelectorAll('.reset-pin-btn').forEach(btn => {
    btn.addEventListener('click', () => openResetPinModal(parseInt(btn.dataset.id, 10), btn.dataset.name));
  });
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

// --- Kid account modal ---

function openKidModal() {
  $('#modal-kid').classList.remove('hidden');
  $('#kid-error').classList.add('hidden');
  setTimeout(() => $('#kid-name').focus(), 100);
}

function closeKidModal() {
  $('#modal-kid').classList.add('hidden');
  $('#kid-form').reset();
  $('#kid-error').classList.add('hidden');
}

async function submitKid(e) {
  e.preventDefault();
  const name = $('#kid-name').value.trim();
  const emoji = $('#kid-emoji').value.trim() || '🌱';
  const pin = $('#kid-pin').value;
  const confirm = $('#kid-pin-confirm').value;

  const errEl = $('#kid-error');
  errEl.classList.add('hidden');

  if (!/^\d{4}$/.test(pin)) {
    errEl.textContent = 'PIN must be exactly 4 digits.';
    errEl.classList.remove('hidden');
    return;
  }
  if (pin !== confirm) {
    errEl.textContent = 'PINs don\u2019t match.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Creating\u2026';

  try {
    const res = await fetch('/api/kids', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pin, avatar_emoji: emoji })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Could not create kid account.';
      errEl.classList.remove('hidden');
      return;
    }
    closeKidModal();
    loadFamily();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create kid account';
  }
}

// --- Reset PIN modal ---

function openResetPinModal(memberId, name) {
  $('#reset-pin-member-id').value = memberId;
  $('#reset-pin-name').textContent = name;
  $('#reset-pin-error').classList.add('hidden');
  $('#modal-reset-pin').classList.remove('hidden');
  setTimeout(() => $('#reset-pin-value').focus(), 100);
}

function closeResetPinModal() {
  $('#modal-reset-pin').classList.add('hidden');
  $('#reset-pin-form').reset();
  $('#reset-pin-error').classList.add('hidden');
}

async function submitResetPin(e) {
  e.preventDefault();
  const memberId = parseInt($('#reset-pin-member-id').value, 10);
  const pin = $('#reset-pin-value').value;
  const confirm = $('#reset-pin-confirm').value;

  const errEl = $('#reset-pin-error');
  errEl.classList.add('hidden');

  if (!/^\d{4}$/.test(pin)) {
    errEl.textContent = 'PIN must be exactly 4 digits.';
    errEl.classList.remove('hidden');
    return;
  }
  if (pin !== confirm) {
    errEl.textContent = 'PINs don\u2019t match.';
    errEl.classList.remove('hidden');
    return;
  }

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Resetting\u2026';

  try {
    const res = await fetch('/api/kids/reset-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: memberId, pin })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Could not reset PIN.';
      errEl.classList.remove('hidden');
      return;
    }
    closeResetPinModal();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Reset PIN';
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function timeAgo(unix) {
  const seconds = Math.floor(Date.now() / 1000) - unix;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
