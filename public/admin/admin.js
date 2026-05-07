// Admin panel

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let me = null;

(async function boot() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.replace('/'); return; }
    const data = await res.json();
    me = data.member;
    if (me.role !== 'admin') { window.location.replace('/'); return; }
    init();
  } catch (e) { window.location.replace('/'); }
})();

function init() {
  $('#admin-content').classList.remove('hidden');
  $('#user-name').textContent = me.name;
  $('#user-emoji').textContent = me.avatar_emoji || '🌱';

  $('#signout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/';
  });

  // Add member modal
  $('#add-member-btn').addEventListener('click', () => {
    $('#modal-add').classList.remove('hidden');
    setTimeout(() => $('#add-name').focus(), 100);
  });
  $$('[data-close-add]').forEach(el => el.addEventListener('click', () => {
    $('#modal-add').classList.add('hidden');
    $('#add-form').reset();
    $('#add-error').classList.add('hidden');
  }));
  $('#add-form').addEventListener('submit', addMember);

  // Edit member modal
  $$('[data-close-edit]').forEach(el => el.addEventListener('click', () => {
    $('#modal-edit-member').classList.add('hidden');
    $('#edit-member-form').reset();
    $('#edit-member-error').classList.add('hidden');
  }));
  $('#edit-member-form').addEventListener('submit', editMember);

  loadMembers();
}

async function loadMembers() {
  const res = await fetch('/api/admin/members');
  if (!res.ok) return;
  const data = await res.json();
  renderMembers(data.members);
}

function renderMembers(members) {
  const body = $('#members-body');
  body.innerHTML = members.map(m => `
    <tr>
      <td class="td-emoji">${m.avatar_emoji || '🌱'}</td>
      <td class="td-name">${esc(m.name)}</td>
      <td>${esc(m.username || '-')}</td>
      <td>${esc(m.email)}</td>
      <td class="td-role"><span class="role-badge ${m.role}">${m.role}</span></td>
      <td>${m.birthday || '-'}</td>
      <td>${m.anniversary || '-'}</td>
      <td class="td-actions">
        <button class="btn-edit" data-edit='${JSON.stringify(m).replace(/'/g, '&#39;')}'>Edit</button>
        <button class="btn-remove" data-remove-id="${m.id}" data-remove-name="${esc(m.name)}">Remove</button>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const m = JSON.parse(btn.dataset.edit);
      openEditMember(m);
    });
  });

  body.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => removeMember(parseInt(btn.dataset.removeId), btn.dataset.removeName));
  });
}

function openEditMember(m) {
  $('#edit-member-id').value = m.id;
  $('#edit-member-title').textContent = m.name;
  $('#edit-name').value = m.name;
  $('#edit-username').value = m.username || '';
  $('#edit-email').value = m.email;
  $('#edit-role').value = m.role;
  $('#edit-birthday').value = m.birthday || '';
  $('#edit-anniversary').value = m.anniversary || '';
  $('#edit-emoji').value = m.avatar_emoji || '';
  $('#edit-member-error').classList.add('hidden');
  $('#modal-edit-member').classList.remove('hidden');
}

async function editMember(e) {
  e.preventDefault();
  const errEl = $('#edit-member-error');
  errEl.classList.add('hidden');

  const body = {
    id: parseInt($('#edit-member-id').value),
    name: $('#edit-name').value.trim(),
    username: $('#edit-username').value.trim() || null,
    email: $('#edit-email').value.trim(),
    role: $('#edit-role').value,
    birthday: $('#edit-birthday').value.trim() || null,
    anniversary: $('#edit-anniversary').value.trim() || null,
    avatar_emoji: $('#edit-emoji').value.trim() || '🌱'
  };

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Saving\u2026';

  try {
    const res = await fetch('/api/admin/members', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Could not update.';
      errEl.classList.remove('hidden');
      return;
    }
    $('#modal-edit-member').classList.add('hidden');
    loadMembers();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save changes';
  }
}

async function addMember(e) {
  e.preventDefault();
  const errEl = $('#add-error');
  errEl.classList.add('hidden');

  const body = {
    name: $('#add-name').value.trim(),
    email: $('#add-email').value.trim(),
    role: $('#add-role').value
  };

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Adding\u2026';

  try {
    const res = await fetch('/api/admin/members', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Could not add.';
      errEl.classList.remove('hidden');
      return;
    }
    $('#modal-add').classList.add('hidden');
    $('#add-form').reset();
    loadMembers();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add member';
  }
}

async function removeMember(id, name) {
  if (!confirm(`Remove ${name} from the family? This deletes their account and contributions.`)) return;

  await fetch('/api/admin/members', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  loadMembers();
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
