// Generosity room — front end
// Auth gate: if not signed in, redirect to /signin/?next=/generosity/
// Otherwise load the pot.

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const state = {
  member: null,
  pot: null,
  suggestions: [],
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

  setupTabs();
  setupModal();
  setupSignout();
  setupPledges();
  setupDisburse();
  setupReceptions();
  loadPot();
  loadSuggestions();
  loadPledges();
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

  const isAdmin = state.member.role === 'admin';
  list.innerHTML = recent_contributions.map(c => {
    const note = c.note ? `<div class="contrib-note">"${escapeHtml(c.note)}"</div>` : '';
    const actions = isAdmin ? `
      <div class="contrib-actions">
        <button class="contrib-edit" data-id="${c.id}" data-amount="${c.amount_cents}" data-kind="${c.kind}" data-note="${escapeHtml(c.note || '')}">Edit</button>
        <button class="contrib-del" data-id="${c.id}">Del</button>
      </div>` : '';
    return `
      <li class="contribution-item">
        <div class="contrib-avatar">${c.avatar_emoji || '🌱'}</div>
        <div class="contrib-body">
          <strong>${escapeHtml(c.member_name)}</strong>
          <div class="contrib-meta">${kindLabel(c.kind)} \u00b7 ${timeAgo(c.created_at)}</div>
          ${note}
        </div>
        <div class="contrib-right">
          <div class="contrib-amount">+${formatMoney(c.amount_cents)}</div>
          ${actions}
        </div>
      </li>
    `;
  }).join('');

  // Admin action listeners
  if (isAdmin) {
    list.querySelectorAll('.contrib-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this contribution?')) return;
        await fetch('/api/pot', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: parseInt(btn.dataset.id) })
        });
        loadPot();
      });
    });
    list.querySelectorAll('.contrib-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        openEditModal(parseInt(btn.dataset.id), parseInt(btn.dataset.amount), btn.dataset.kind, btn.dataset.note);
      });
    });
  }
}

function kindLabel(kind) {
  return ({
    'monthly-allocation': 'Monthly',
    'one-time': 'One-time',
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
// SUGGEST TAB
// =========================================================
$('#new-suggestion-btn').addEventListener('click', () => {
  $('#modal-suggest').classList.remove('hidden');
  setTimeout(() => $('#suggest-name').focus(), 100);
});
$$('[data-close-suggest]').forEach(el => el.addEventListener('click', () => {
  $('#modal-suggest').classList.add('hidden');
  $('#suggest-form').reset();
  $('#suggest-error').classList.add('hidden');
}));

$('#suggest-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = $('#suggest-error');
  errEl.classList.add('hidden');

  const body = {
    recipient_name: $('#suggest-name').value.trim(),
    story: $('#suggest-story').value.trim(),
    scripture: $('#suggest-scripture').value.trim() || null,
    suggested_amount_cents: $('#suggest-amount').value ? Math.round(parseFloat($('#suggest-amount').value) * 100) : null,
    decision_needed_by: $('#suggest-deadline').value || null
  };

  if (!body.recipient_name || !body.story) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Submitting\u2026';

  try {
    const res = await fetch('/api/suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Could not submit.';
      errEl.classList.remove('hidden');
      return;
    }
    $('#modal-suggest').classList.add('hidden');
    $('#suggest-form').reset();
    loadSuggestions();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit suggestion';
  }
});

async function loadSuggestions() {
  try {
    const res = await fetch('/api/suggestions');
    if (!res.ok) return;
    const data = await res.json();
    state.suggestions = data.suggestions || [];
    renderSuggestTab();
    renderStoriesTab();
  } catch (e) { console.error(e); }
}

function renderSuggestTab() {
  const open = state.suggestions.filter(s => s.status === 'open');
  const container = $('#my-suggestions');
  if (open.length === 0) {
    container.innerHTML = '<p class="empty">No suggestions yet. Be the first to nominate someone!</p>';
  } else {
    container.innerHTML = '<h3 class="section-title">Open suggestions</h3>' +
      open.map(s => renderSuggestionCard(s, true)).join('');
  }
  wireVoteButtons();
}

async function renderStoriesTab() {
  const decided = state.suggestions.filter(s => s.status === 'approved' || s.status === 'declined' || s.status === 'disbursed');
  const list = $('#stories-list');
  if (decided.length === 0) {
    list.innerHTML = '<p class="empty">No stories yet. Suggest someone, vote, and watch the story unfold.</p>';
    return;
  }

  const isAdmin = state.member.role === 'admin' || state.member.role === 'parent';

  // Load receptions for all decided suggestions
  const receptionsByStory = {};
  for (const s of decided) {
    try {
      const res = await fetch(`/api/receptions?suggestion_id=${s.id}`);
      if (res.ok) {
        const data = await res.json();
        receptionsByStory[s.id] = data.receptions || [];
      }
    } catch (e) { /* skip */ }
  }

  list.innerHTML = decided.map(s => {
    const badge = `<span class="sg-status-badge ${s.status}">${s.status}</span>`;
    const decisionNote = s.parent_decision_note
      ? `<div class="sg-decision-note">${escapeHtml(s.parent_decision_note)} &mdash; ${escapeHtml(s.decided_by_name || 'Parent')}</div>`
      : '';
    const disburseBtn = (s.status === 'approved' && isAdmin)
      ? `<div style="margin-top:12px"><button class="btn-primary disburse-btn" data-sg-id="${s.id}" data-amount="${s.suggested_amount_cents || 0}">Mark as sent</button></div>`
      : '';

    // Receptions / God stories
    const receptions = receptionsByStory[s.id] || [];
    const receptionsHtml = receptions.map(r => `
      <div class="reception-update">
        ${r.image_url ? `<img src="${escapeHtml(r.image_url)}" class="reception-img" />` : ''}
        <div class="reception-text">${escapeHtml(r.content).replace(/\n/g, '<br>')}</div>
        <div class="reception-meta">${escapeHtml(r.avatar_emoji || '🌱')} ${escapeHtml(r.added_by_name)} · ${timeAgo(r.created_at)}</div>
      </div>
    `).join('');

    const addUpdateBtn = (s.status === 'approved' || s.status === 'disbursed')
      ? `<button class="btn-ghost add-update-btn" data-sg-id="${s.id}" style="margin-top:12px">+ Add a God story update</button>`
      : '';

    return `
    <div class="story-card">
      <div class="sg-header">
        <span class="sg-recipient">${escapeHtml(s.recipient_name)}</span>
        <div>${badge} ${s.suggested_amount_cents ? '<span class="sg-amount">' + formatMoney(s.suggested_amount_cents) + '</span>' : ''}</div>
      </div>
      <div class="sg-story">${escapeHtml(s.story)}</div>
      ${s.scripture ? '<div class="sg-scripture">"' + escapeHtml(s.scripture) + '"</div>' : ''}
      <div class="sg-meta">${escapeHtml(s.avatar_emoji || '🌱')} ${escapeHtml(s.suggested_by_name)} · ${s.yes_count} yes · ${s.pass_count} pass</div>
      ${decisionNote}
      ${disburseBtn}
      ${receptions.length > 0 ? '<div class="receptions-section"><h4 class="receptions-title">How God moved</h4>' + receptionsHtml + '</div>' : ''}
      ${addUpdateBtn}
    </div>`;
  }).join('');

  // Wire disburse buttons
  list.querySelectorAll('.disburse-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('#disburse-sg-id').value = btn.dataset.sgId;
      $('#disburse-amount').value = btn.dataset.amount ? (parseInt(btn.dataset.amount) / 100).toFixed(2) : '';
      $('#modal-disburse').classList.remove('hidden');
    });
  });

  // Wire add update buttons
  list.querySelectorAll('.add-update-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('#reception-sg-id').value = btn.dataset.sgId;
      $('#reception-error').classList.add('hidden');
      $('#modal-reception').classList.remove('hidden');
      setTimeout(() => $('#reception-content').focus(), 100);
    });
  });
}

function renderSuggestionCard(s, showVoting) {
  const isAdmin = state.member.role === 'admin' || state.member.role === 'parent';
  const badge = `<span class="sg-status-badge ${s.status}">${s.status}</span>`;

  let footer = '';
  if (showVoting && s.status === 'open') {
    const yesClass = s.my_vote === 'yes' ? ' voted' : '';
    const passClass = s.my_vote === 'pass' ? ' voted' : '';
    footer = `
    <div class="sg-footer">
      <div class="vote-btns">
        <button class="vote-btn vote-btn-yes${yesClass}" data-sg-id="${s.id}" data-vote="yes">Yes</button>
        <button class="vote-btn vote-btn-pass${passClass}" data-sg-id="${s.id}" data-vote="pass">Pass</button>
      </div>
      <span class="vote-counts">${s.yes_count} yes · ${s.pass_count} pass</span>
      ${isAdmin ? '<button class="decide-btn" data-decide-id="' + s.id + '" data-decide-name="' + escapeHtml(s.recipient_name) + '">Decide</button>' : ''}
    </div>`;
  } else {
    footer = `<div class="sg-footer"><span class="vote-counts">${s.yes_count} yes · ${s.pass_count} pass</span>${badge}</div>`;
  }

  return `
  <div class="suggestion-card">
    <div class="sg-header">
      <span class="sg-recipient">${escapeHtml(s.recipient_name)}</span>
      ${s.suggested_amount_cents ? '<span class="sg-amount">' + formatMoney(s.suggested_amount_cents) + '</span>' : ''}
    </div>
    <div class="sg-story">${escapeHtml(s.story)}</div>
    ${s.scripture ? '<div class="sg-scripture">"' + escapeHtml(s.scripture) + '"</div>' : ''}
    <div class="sg-meta">${escapeHtml(s.avatar_emoji || '🌱')} ${escapeHtml(s.suggested_by_name)} · ${timeAgo(s.created_at)}${s.decision_needed_by ? ' · <strong style="color:var(--accent)">Need decision by ' + escapeHtml(s.decision_needed_by) + '</strong>' : ''}</div>
    ${s.parent_decision_note ? '<div class="sg-decision-note">' + escapeHtml(s.parent_decision_note) + '</div>' : ''}
    ${footer}
  </div>`;
}

function wireVoteButtons() {
  $$('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sgId = parseInt(btn.dataset.sgId);
      const vote = btn.dataset.vote;
      btn.disabled = true;
      try {
        await fetch('/api/votes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ suggestion_id: sgId, vote })
        });
        loadSuggestions();
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Decide buttons (admin)
  $$('.decide-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $('#decide-id').value = btn.dataset.decideId;
      $('#decide-title').innerHTML = 'Decide on <em>' + btn.dataset.decideName + '</em>';
      $('#modal-decide').classList.remove('hidden');
    });
  });
}

// Decide modal
$$('[data-close-decide]').forEach(el => el.addEventListener('click', () => {
  $('#modal-decide').classList.add('hidden');
  $('#decide-form').reset();
}));

$('#decide-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    id: parseInt($('#decide-id').value),
    status: $('#decide-status').value,
    note: $('#decide-note').value.trim()
  };

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Submitting\u2026';

  try {
    await fetch('/api/suggestions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    $('#modal-decide').classList.add('hidden');
    $('#decide-form').reset();
    loadSuggestions();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit decision';
  }
});

// =========================================================
// PLEDGES
// =========================================================
function setupPledges() {
  $$('[data-close-pledge]').forEach(el => el.addEventListener('click', () => {
    $('#modal-pledge').classList.add('hidden');
  }));
  $('#pledge-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = parseFloat($('#pledge-amount').value);
    if (!amount || amount <= 0) return;
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      await fetch('/api/pledges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount_cents: Math.round(amount * 100) })
      });
      $('#modal-pledge').classList.add('hidden');
      loadPledges();
    } finally { btn.disabled = false; }
  });
}

async function loadPledges() {
  try {
    const res = await fetch('/api/pledges');
    if (!res.ok) return;
    const data = await res.json();
    renderPledge(data.my_pledge, data.all_pledges);
  } catch (e) { console.error(e); }
}

function renderPledge(myPledge, allPledges) {
  const el = $('#pledge-status');
  if (myPledge) {
    const amount = (myPledge.amount_cents / 100).toFixed(2);
    el.innerHTML = `
      <span>Your monthly pledge: <strong>$${amount}</strong></span>
      <button class="link-btn" id="change-pledge">Change</button>
      <button class="link-btn" id="cancel-pledge" style="color:var(--rose)">Cancel</button>
    `;
    $('#change-pledge').addEventListener('click', () => {
      $('#pledge-amount').value = (myPledge.amount_cents / 100).toFixed(2);
      $('#modal-pledge').classList.remove('hidden');
    });
    $('#cancel-pledge').addEventListener('click', async () => {
      if (!confirm('Cancel your monthly pledge?')) return;
      await fetch('/api/pledges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel: true })
      });
      loadPledges();
    });
  } else {
    el.innerHTML = '<button class="btn-ghost" id="start-pledge">Set up monthly giving</button>';
    $('#start-pledge').addEventListener('click', () => {
      $('#modal-pledge').classList.remove('hidden');
      setTimeout(() => $('#pledge-amount').focus(), 100);
    });
  }

  // Admin: show record button
  const adminSection = $('#admin-pledge-section');
  if (state.member.role === 'admin' && allPledges && allPledges.length > 0) {
    adminSection.classList.remove('hidden');
    const btn = $('#record-pledges-btn');
    btn.onclick = async () => {
      btn.disabled = true;
      btn.textContent = 'Recording\u2026';
      try {
        const res = await fetch('/api/pledges', { method: 'PUT' });
        const data = await res.json();
        btn.textContent = `Recorded ${data.recorded} pledges for ${data.month}`;
        loadPot();
      } finally {
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Record all monthly pledges'; }, 3000);
      }
    };
  } else {
    adminSection.classList.add('hidden');
  }
}

// =========================================================
// DISBURSE (admin — mark approved suggestion as sent)
// =========================================================
function setupDisburse() {
  $$('[data-close-disburse]').forEach(el => el.addEventListener('click', () => {
    $('#modal-disburse').classList.add('hidden');
  }));
  $('#disburse-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      suggestion_id: parseInt($('#disburse-sg-id').value),
      amount_cents: Math.round(parseFloat($('#disburse-amount').value) * 100),
      method: $('#disburse-method').value,
      method_note: $('#disburse-note').value.trim()
    };
    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Sending\u2026';
    try {
      await fetch('/api/disburse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      $('#modal-disburse').classList.add('hidden');
      $('#disburse-form').reset();
      loadSuggestions();
      loadPot();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Mark as sent';
    }
  });
}

// =========================================================
// RECEPTIONS (God story updates)
// =========================================================
function setupReceptions() {
  $$('[data-close-reception]').forEach(el => el.addEventListener('click', () => {
    $('#modal-reception').classList.add('hidden');
    $('#reception-form').reset();
  }));
  $('#reception-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = $('#reception-error');
    errEl.classList.add('hidden');

    const formData = new FormData();
    formData.append('suggestion_id', $('#reception-sg-id').value);
    formData.append('content', $('#reception-content').value.trim());

    const imageFile = $('#reception-image').files[0];
    if (imageFile) formData.append('image', imageFile);

    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Adding\u2026';

    try {
      const res = await fetch('/api/receptions', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errEl.textContent = data.error || 'Could not add.';
        errEl.classList.remove('hidden');
        return;
      }
      $('#modal-reception').classList.add('hidden');
      $('#reception-form').reset();
      loadSuggestions();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add update';
    }
  });
}

// =========================================================
// EDIT MODAL (admin only)
// =========================================================
function openEditModal(id, amountCents, kind, note) {
  const modal = $('#modal-edit');
  if (!modal) return;
  $('#edit-id').value = id;
  $('#edit-amount').value = (amountCents / 100).toFixed(2);
  $('#edit-kind').value = kind;
  $('#edit-note').value = note || '';
  modal.classList.remove('hidden');
}

function closeEditModal() {
  const modal = $('#modal-edit');
  if (modal) modal.classList.add('hidden');
}

// Wire up edit modal if it exists (admin only)
if ($('#modal-edit')) {
  $$('#modal-edit [data-close-edit]').forEach(el => el.addEventListener('click', closeEditModal));
  $('#edit-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = parseInt($('#edit-id').value);
    const amount_cents = Math.round(parseFloat($('#edit-amount').value) * 100);
    const kind = $('#edit-kind').value;
    const note = $('#edit-note').value.trim();

    const btn = e.target.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = 'Saving\u2026';

    try {
      await fetch('/api/pot', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, amount_cents, kind, note })
      });
      closeEditModal();
      loadPot();
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save changes';
    }
  });
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
