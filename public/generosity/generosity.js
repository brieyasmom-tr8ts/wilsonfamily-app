// Generosity room — front end
// Auth gate: if not signed in, redirect to /signin/?next=/generosity/
// Otherwise load the pot.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  member: null,
  pot: null,
};

// =========================================================
// BOOT — auth gate
// =========================================================
async function boot() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.replace('/signin/?next=' + encodeURIComponent('/generosity/'));
      return;
    }
    const data = await res.json();
    state.member = data.member;
    init();
  } catch (e) {
    window.location.replace('/signin/?next=' + encodeURIComponent('/generosity/'));
  }
}

function init() {
  $('#user-name').textContent = state.member.name;
  $('#user-emoji').textContent = state.member.avatar_emoji || '🌱';

  if (state.member.role !== 'parent') {
    const opt = $('#kind-select option[value="monthly-allocation"]');
    if (opt) opt.remove();
  }

  setupTabs();
  setupModal();
  setupSignout();
  loadPot();
}

function setupTabs() {
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      $$('.nav-tab').forEach(t => t.classList.toggle('active', t === tab));
      $$('.tab').forEach(t => t.classList.toggle('active', t.id === `tab-${target}`));
    });
  });
}

function setupSignout() {
  $('#signout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/';
  });
}

// =========================================================
// THE POT
// =========================================================
async function loadPot() {
  try {
    const res = await fetch('/api/pot');
    if (!res.ok) {
      if (res.status === 401) {
        window.location.replace('/signin/?next=' + encodeURIComponent('/generosity/'));
        return;
      }
      throw new Error('Failed to load pot');
    }
    state.pot = await res.json();
    renderPot();
  } catch (e) {
    console.error(e);
  }
}

function renderPot() {
  const { balance_cents, total_contributed_cents, total_disbursed_cents, recent_contributions } = state.pot;
  animateNumber($('#balance-amount'), balance_cents / 100);
  $('#balance-contributed').textContent = formatMoney(total_contributed_cents);
  $('#balance-disbursed').textContent = formatMoney(total_disbursed_cents);

  const list = $('#contributions-list');
  if (!recent_contributions || recent_contributions.length === 0) {
    list.innerHTML = '<li class="empty">No contributions yet \u2014 be the first to add to the pot.</li>';
    return;
  }

  list.innerHTML = recent_contributions.map(c => {
    const note = c.note ? `<div class="contrib-note">"${escapeHtml(c.note)}"</div>` : '';
    return `
      <li class="contribution-item">
        <div class="contrib-avatar">${c.avatar_emoji || '🌱'}</div>
        <div class="contrib-body">
          <strong>${escapeHtml(c.member_name)}</strong>
          <div class="contrib-meta">${kindLabel(c.kind)} \u00b7 ${timeAgo(c.created_at)}</div>
          ${note}
        </div>
        <div class="contrib-amount">+${formatMoney(c.amount_cents)}</div>
      </li>
    `;
  }).join('');
}

function kindLabel(kind) {
  return ({
    'monthly-allocation': 'Monthly allocation',
    'kid-contribution': 'Their own money',
    'one-time': 'One-time gift',
  })[kind] || kind;
}

// =========================================================
// MODAL
// =========================================================
function setupModal() {
  $('#add-contribution-btn').addEventListener('click', openModal);
  $$('#modal-contribution [data-close]').forEach(el => el.addEventListener('click', closeModal));
  $('#contribution-form').addEventListener('submit', submitContribution);
}

function openModal() {
  $('#modal-contribution').classList.remove('hidden');
  setTimeout(() => $('#amount-input').focus(), 100);
}

function closeModal() {
  $('#modal-contribution').classList.add('hidden');
  $('#contribution-form').reset();
}

async function submitContribution(e) {
  e.preventDefault();
  const amount = parseFloat($('#amount-input').value);
  if (!amount || amount <= 0) return;

  const body = {
    amount_cents: Math.round(amount * 100),
    kind: $('#kind-select').value,
    note: $('#note-input').value.trim()
  };

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Adding\u2026';

  try {
    const res = await fetch('/api/pot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || 'Could not save the contribution.');
      return;
    }
    closeModal();
    await loadPot();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add it';
  }
}

// =========================================================
// HELPERS
// =========================================================
function formatMoney(cents) {
  const dollars = (cents || 0) / 100;
  return '$' + dollars.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
  const date = new Date(unix * 1000);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function animateNumber(el, target) {
  const duration = 800;
  const start = parseFloat((el.textContent || '0').replace(/,/g, '')) || 0;
  const startTime = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = start + (target - start) * eased;
    el.textContent = value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

boot();
