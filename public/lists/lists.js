// Lists & Wishes

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let me = null;
let lists = [];
let members = [];
let currentList = null;
let currentItems = [];
let selectedVisMembers = new Set();
let showingArchived = false;
let editingListId = null;

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

  loadMembers();

  // New list modal
  $('#new-list-btn').addEventListener('click', () => openListModal());
  $$('[data-close-list]').forEach(el => el.addEventListener('click', closeListModal));
  $('#list-form').addEventListener('submit', submitList);

  // Visibility toggle
  $('#list-form-visibility').addEventListener('change', () => {
    const vis = $('#list-form-visibility').value;
    const wrap = $('#visibility-members-wrap');
    if (vis === 'everyone') { wrap.classList.add('hidden'); }
    else {
      wrap.classList.remove('hidden');
      $('#visibility-members-label').textContent = vis === 'hide_from' ? 'Hide from these people' : 'Only these people can see it';
    }
  });

  // Archived toggle
  $('#show-archived-btn').addEventListener('click', () => {
    showingArchived = !showingArchived;
    $('#show-archived-btn').textContent = showingArchived ? 'Show active' : 'Show archived';
    loadLists();
  });

  // Detail view
  $('#back-to-lists').addEventListener('click', backToLists);
  $('#add-item-btn').addEventListener('click', addItem);
  $('#new-item-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') addItem(); });

  loadLists();
}

async function loadMembers() {
  try {
    let res = await fetch('/api/admin/members');
    if (res.ok) { members = (await res.json()).members || []; }
    else {
      res = await fetch('/api/invites');
      if (res.ok) { members = (await res.json()).members || []; }
    }
  } catch (e) { members = []; }
}

async function loadLists() {
  try {
    const res = await fetch(`/api/lists${showingArchived ? '?archived=1' : ''}`);
    if (!res.ok) return;
    const data = await res.json();
    lists = data.lists || [];
    renderLists();
  } catch (e) { console.error(e); }
}

function renderLists() {
  const grid = $('#lists-grid');
  if (lists.length === 0) {
    grid.innerHTML = `<p class="empty" style="grid-column:1/-1;text-align:center;padding:40px;color:var(--ink-soft)">${showingArchived ? 'No archived lists.' : 'No lists yet. Create the first one!'}</p>`;
    return;
  }

  grid.innerHTML = lists.map((l, i) => {
    const pct = l.item_count > 0 && l.has_checkboxes ? Math.round((l.checked_count / l.item_count) * 100) : -1;
    const progressHtml = pct >= 0 ? `<div class="list-card-progress"><div class="list-card-progress-bar" style="width:${pct}%"></div></div>` : '';
    return `
    <div class="list-card ${l.archived ? 'archived' : ''}" data-list-id="${l.id}" style="animation-delay:${Math.min(i * 0.04, 0.2)}s">
      <div class="list-card-title">${esc(l.title)}</div>
      <div class="list-card-meta">${esc(l.avatar_emoji || '🌱')} ${esc(l.owner_name)} · ${l.item_count} items${l.has_checkboxes && l.item_count > 0 ? ' · ' + l.checked_count + ' done' : ''}</div>
      ${progressHtml}
    </div>`;
  }).join('');

  grid.querySelectorAll('.list-card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.listId);
      openListDetail(id);
    });
  });
}

async function openListDetail(listId) {
  const list = lists.find(l => l.id === listId);
  if (!list) return;
  currentList = list;

  $('#list-title').textContent = list.title;
  const isOwner = list.owner_id === me.id || me.role === 'admin';
  $('#list-owner-info').textContent = `${list.avatar_emoji || '🌱'} ${list.owner_name}'s list${list.allow_others_add ? ' · anyone can add' : ''}`;

  // Show/hide controls
  $('#edit-list-btn').classList.toggle('hidden', !isOwner);
  $('#archive-list-btn').classList.toggle('hidden', !isOwner);
  $('#delete-list-btn').classList.toggle('hidden', !isOwner);
  $('#add-item-wrap').classList.toggle('hidden', !isOwner && !list.allow_others_add);

  if (isOwner) {
    $('#edit-list-btn').onclick = () => openListModal(list);
    $('#archive-list-btn').textContent = list.archived ? 'Unarchive' : 'Archive';
    $('#archive-list-btn').onclick = async () => {
      await fetch('/api/lists', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: list.id, archived: !list.archived })
      });
      backToLists();
      loadLists();
    };
    $('#delete-list-btn').onclick = async () => {
      if (!confirm('Delete this list and all its items?')) return;
      await fetch('/api/lists', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: list.id })
      });
      backToLists();
      loadLists();
    };
  }

  $('#lists-view').classList.add('hidden');
  $('#list-detail').classList.remove('hidden');
  loadItems(listId);
}

function backToLists() {
  currentList = null;
  $('#list-detail').classList.add('hidden');
  $('#lists-view').classList.remove('hidden');
  loadLists();
}

async function loadItems(listId) {
  try {
    const res = await fetch(`/api/list-items?list_id=${listId}`);
    if (!res.ok) return;
    const data = await res.json();
    currentItems = data.items || [];
    renderItems();
  } catch (e) { console.error(e); }
}

function renderItems() {
  const list = $('#items-list');
  if (currentItems.length === 0) {
    list.innerHTML = '<p class="empty" style="text-align:center;padding:32px;color:var(--ink-soft)">No items yet. Add the first one!</p>';
    return;
  }

  const useCheckboxes = currentList && currentList.has_checkboxes;
  const isOwner = currentList && (currentList.owner_id === me.id || me.role === 'admin');

  list.innerHTML = currentItems.map(item => {
    const checkboxHtml = useCheckboxes
      ? `<button class="item-checkbox ${item.checked ? 'checked' : ''}" data-item-id="${item.id}">${item.checked ? '✓' : ''}</button>`
      : '';
    const canEdit = isOwner || item.added_by === me.id;
    return `
    <li class="item-row ${item.checked ? 'checked' : ''}">
      ${checkboxHtml}
      <span class="item-text" ${canEdit ? 'data-edit-id="' + item.id + '" title="Click to edit"' : ''}>${esc(item.text)}</span>
      <span class="item-added-by">${esc(item.added_by_name)}</span>
      ${canEdit ? '<button class="item-delete" data-del-id="' + item.id + '">×</button>' : ''}
    </li>`;
  }).join('');

  // Wire checkboxes
  list.querySelectorAll('.item-checkbox').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.itemId);
      const item = currentItems.find(i => i.id === id);
      await fetch('/api/list-items', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, checked: !item.checked })
      });
      loadItems(currentList.id);
    });
  });

  // Wire deletes
  list.querySelectorAll('.item-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      await fetch('/api/list-items', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(btn.dataset.delId) })
      });
      loadItems(currentList.id);
    });
  });

  // Wire inline edit
  list.querySelectorAll('[data-edit-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = parseInt(el.dataset.editId);
      const item = currentItems.find(i => i.id === id);
      if (!item) return;
      const newText = prompt('Edit item:', item.text);
      if (newText !== null && newText.trim() && newText.trim() !== item.text) {
        fetch('/api/list-items', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, text: newText.trim() })
        }).then(() => loadItems(currentList.id));
      }
    });
    el.style.cursor = 'pointer';
  });
}

async function addItem() {
  const input = $('#new-item-input');
  const text = input.value.trim();
  if (!text || !currentList) return;

  input.value = '';
  await fetch('/api/list-items', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ list_id: currentList.id, text })
  });
  loadItems(currentList.id);
}

// List modal
function openListModal(list) {
  editingListId = list ? list.id : null;
  $('#list-edit-id').value = editingListId || '';
  $('#list-form-title').value = list ? list.title : '';
  $('#list-form-checkboxes').value = list ? (list.has_checkboxes ? '1' : '0') : '1';
  $('#list-form-others-add').value = list ? (list.allow_others_add ? '1' : '0') : '0';
  $('#list-form-visibility').value = list ? list.visibility : 'everyone';
  $('#list-modal-eyebrow').textContent = list ? 'Edit list' : 'New list';
  $('#list-error').classList.add('hidden');

  const vis = list ? list.visibility : 'everyone';
  $('#visibility-members-wrap').classList.toggle('hidden', vis === 'everyone');

  // Render member picker
  selectedVisMembers.clear();
  if (list && list.visibility_members) {
    list.visibility_members.split(',').forEach(id => selectedVisMembers.add(parseInt(id.trim())));
  }
  renderVisMemberGrid();

  const btn = $('#list-form').querySelector('button[type=submit]');
  btn.textContent = list ? 'Save changes' : 'Save list';

  $('#modal-list').classList.remove('hidden');
  setTimeout(() => $('#list-form-title').focus(), 100);
}

function renderVisMemberGrid() {
  const grid = $('#visibility-members-grid');
  grid.innerHTML = members.filter(m => m.id !== me.id).map(m =>
    `<button type="button" class="tag-opt ${selectedVisMembers.has(m.id) ? 'selected' : ''}" data-mid="${m.id}">${esc(m.avatar_emoji || '🌱')} ${esc(m.name)}</button>`
  ).join('');
  grid.querySelectorAll('.tag-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.mid);
      if (selectedVisMembers.has(id)) { selectedVisMembers.delete(id); btn.classList.remove('selected'); }
      else { selectedVisMembers.add(id); btn.classList.add('selected'); }
    });
  });
}

function closeListModal() {
  $('#modal-list').classList.add('hidden');
  $('#list-form').reset();
  editingListId = null;
}

async function submitList(e) {
  e.preventDefault();
  const errEl = $('#list-error');
  errEl.classList.add('hidden');

  const body = {
    title: $('#list-form-title').value.trim(),
    has_checkboxes: $('#list-form-checkboxes').value === '1',
    allow_others_add: $('#list-form-others-add').value === '1',
    visibility: $('#list-form-visibility').value,
    visibility_members: selectedVisMembers.size > 0 ? Array.from(selectedVisMembers).join(',') : null
  };

  if (!body.title) return;

  const method = editingListId ? 'PUT' : 'POST';
  if (editingListId) body.id = editingListId;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;

  try {
    const res = await fetch('/api/lists', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Could not save.';
      errEl.classList.remove('hidden');
      return;
    }
    closeListModal();
    if (currentList && editingListId) {
      // Refresh detail view
      loadLists();
      Object.assign(currentList, body);
      $('#list-title').textContent = body.title;
    } else {
      loadLists();
    }
  } finally {
    btn.disabled = false;
  }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
