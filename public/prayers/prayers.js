// Prayer & Praise Wall

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let me = null;
let currentFilter = '';

(async function boot() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.replace('/'); return; }
    const data = await res.json();
    me = data.member;
    init();
  } catch (e) { window.location.replace('/'); }
})();

function init() {
  $('#user-name').textContent = me.name;
  $('#user-emoji').textContent = me.avatar_emoji || '🌱';

  $('#signout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/';
  });

  // Filter tabs
  $$('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      currentFilter = tab.dataset.filter;
      $$('.filter-tab').forEach(t => t.classList.toggle('active', t === tab));
      loadPrayers();
    });
  });

  // Add prayer modal
  $('#add-prayer-btn').addEventListener('click', () => {
    $('#modal-prayer').classList.remove('hidden');
    setTimeout(() => $('#prayer-content').focus(), 100);
  });
  $$('[data-close-prayer]').forEach(el => el.addEventListener('click', () => {
    $('#modal-prayer').classList.add('hidden');
    $('#prayer-form').reset();
    $('#prayer-error').classList.add('hidden');
    $$('.type-btn').forEach(b => b.classList.toggle('active', b.dataset.ptype === 'prayer'));
    $('#prayer-type').value = 'prayer';
  }));

  // Type toggle
  $$('.type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.type-btn').forEach(b => b.classList.toggle('active', b === btn));
      $('#prayer-type').value = btn.dataset.ptype;
    });
  });

  $('#prayer-form').addEventListener('submit', submitPrayer);

  // Answered modal
  $$('[data-close-answered]').forEach(el => el.addEventListener('click', () => {
    $('#modal-answered').classList.add('hidden');
  }));
  $('#answered-form').addEventListener('submit', submitAnswered);

  loadPrayers();
}

async function loadPrayers() {
  let url = '/api/prayers';
  const apiFilter = currentFilter === 'faithfulness' ? 'answered' : currentFilter;
  if (apiFilter) url += `?filter=${apiFilter}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    if (currentFilter === 'faithfulness') {
      renderFaithfulness(data.prayers || []);
    } else {
      renderWall(data.prayers || []);
    }
  } catch (e) { console.error(e); }
}

function renderWall(prayers) {
  const wall = $('#prayer-wall');
  if (prayers.length === 0) {
    wall.innerHTML = '<p class="empty" style="text-align:center;padding:48px;color:var(--ink-soft)">The wall is quiet. Add the first prayer or praise.</p>';
    return;
  }

  wall.innerHTML = prayers.map((p, i) => {
    const isOwner = p.posted_by === me.id;
    const isAdmin = me.role === 'admin';
    const canManage = isOwner || isAdmin;
    const cardClass = p.answered ? 'is-answered' : p.type === 'praise' ? 'is-praise' : 'is-prayer';
    const badgeClass = p.answered ? 'answered' : p.type;
    const badgeText = p.answered ? 'Answered!' : p.type === 'praise' ? 'Praise' : 'Prayer';
    const prayed = p.i_prayed ? ' prayed' : '';

    let actions = '';
    if (p.type === 'prayer' && !p.answered) {
      actions += `<button class="pray-btn${prayed}" data-pray-id="${p.id}">🙏 ${p.pray_count > 0 ? p.pray_count + ' prayed' : 'I prayed'}</button>`;
    } else if (p.pray_count > 0) {
      actions += `<span style="font-size:12px;color:var(--ink-soft)">🙏 ${p.pray_count} prayed</span>`;
    }

    if (canManage && p.type === 'prayer' && !p.answered) {
      actions += `<button class="prayer-action-btn answered-btn" data-ans-id="${p.id}">✓ Answered</button>`;
    }
    if (canManage) {
      actions += `<button class="prayer-action-btn del" data-del-id="${p.id}">Del</button>`;
    }

    return `
    <div class="prayer-card ${cardClass}" style="animation-delay:${Math.min(i * 0.04, 0.3)}s">
      <span class="prayer-type-badge ${badgeClass}">${badgeText}</span>
      <div class="prayer-content">${escLines(p.content)}</div>
      ${p.answered_note ? '<div class="prayer-answered-note">' + escLines(p.answered_note) + '</div>' : ''}
      <div class="prayer-footer">
        <span class="prayer-meta">${esc(p.avatar_emoji || '🌱')} ${esc(p.posted_by_name)} · ${timeAgo(p.created_at)}</span>
        <div class="prayer-actions">${actions}</div>
      </div>
    </div>`;
  }).join('');

  // Wire buttons
  wall.querySelectorAll('.pray-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      await fetch('/api/pray', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prayer_id: parseInt(btn.dataset.prayId) })
      });
      loadPrayers();
    });
  });

  wall.querySelectorAll('.answered-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('#answered-id').value = btn.dataset.ansId;
      $('#modal-answered').classList.remove('hidden');
    });
  });

  wall.querySelectorAll('[data-del-id]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this from the wall?')) return;
      await fetch('/api/prayers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(btn.dataset.delId) })
      });
      loadPrayers();
    });
  });
}

async function submitPrayer(e) {
  e.preventDefault();
  const content = $('#prayer-content').value.trim();
  if (!content) return;

  const errEl = $('#prayer-error');
  errEl.classList.add('hidden');

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Posting\u2026';

  try {
    const res = await fetch('/api/prayers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, type: $('#prayer-type').value })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Could not post.';
      errEl.classList.remove('hidden');
      return;
    }
    $('#modal-prayer').classList.add('hidden');
    $('#prayer-form').reset();
    loadPrayers();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post to the wall';
  }
}

async function submitAnswered(e) {
  e.preventDefault();
  const id = parseInt($('#answered-id').value);
  const note = $('#answered-note').value.trim();

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;

  try {
    await fetch('/api/prayers', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, answered: true, answered_note: note || null })
    });
    $('#modal-answered').classList.add('hidden');
    $('#answered-form').reset();
    loadPrayers();
  } finally { btn.disabled = false; }
}

function renderFaithfulness(prayers) {
  const wall = $('#prayer-wall');
  if (prayers.length === 0) {
    wall.innerHTML = '<p class="empty" style="text-align:center;padding:48px;color:var(--ink-soft)">No answered prayers yet. When God moves, mark a prayer as answered to remember it here.</p>';
    return;
  }

  wall.innerHTML = `
    <div class="faithfulness-intro">
      <div class="faithfulness-icon">🪨</div>
      <p class="faithfulness-verse"><em>&ldquo;The Lord has done great things for us, and we are filled with joy.&rdquo;</em><br><span style="font-size:11px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:var(--primary)">Psalm 126:3</span></p>
    </div>
  ` + prayers.map((p, i) => {
    const hasNote = p.answered_note && p.answered_note.trim();
    return `
    <div class="faith-card" style="animation-delay:${Math.min(i * 0.05, 0.3)}s">
      <div class="faith-prayer">
        <span class="faith-label">We prayed</span>
        <div class="faith-content">${escLines(p.content)}</div>
      </div>
      ${hasNote ? `
      <div class="faith-answer">
        <span class="faith-label faith-label-answer">God answered</span>
        <div class="faith-content">${escLines(p.answered_note)}</div>
      </div>` : `
      <div class="faith-answer">
        <span class="faith-label faith-label-answer">God answered!</span>
      </div>`}
      <div class="faith-meta">
        ${esc(p.avatar_emoji || '🌱')} ${esc(p.posted_by_name)} &middot; ${timeAgo(p.created_at)}
        ${p.pray_count > 0 ? ` &middot; 🙏 ${p.pray_count} prayed` : ''}
      </div>
    </div>`;
  }).join('');
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
function escLines(s) { return esc(s).replace(/\n/g, '<br>'); }

function timeAgo(unix) {
  const seconds = Math.floor(Date.now() / 1000) - unix;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
