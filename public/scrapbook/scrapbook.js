// Scrapbook — photo grid with tags

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let me = null;
let photos = [];
let members = [];
let selectedTags = new Set();
let currentPage = 1;

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

  // Load members for filter + tag picker
  loadMembers();

  // Photo file preview
  $('#photo-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const thumb = $('#photo-thumb');
    thumb.src = URL.createObjectURL(file);
    thumb.classList.remove('hidden');
    $('#photo-upload-label').style.display = 'none';
  });

  // Modal
  $('#add-photo-btn').addEventListener('click', openPhotoModal);
  $$('[data-close-photo]').forEach(el => el.addEventListener('click', closePhotoModal));
  $('#photo-form').addEventListener('submit', submitPhoto);

  // Viewer
  $('#viewer-close').addEventListener('click', closeViewer);
  $('.viewer-backdrop').addEventListener('click', closeViewer);

  // Filter
  $('#filter-member').addEventListener('change', () => {
    currentPage = 1;
    loadPhotos();
  });

  $('#load-more').addEventListener('click', () => {
    currentPage++;
    loadPhotos(true);
  });

  loadPhotos();
}

async function loadMembers() {
  try {
    // Use admin endpoint if admin, otherwise use a simpler approach
    const res = await fetch('/api/kids'); // This returns all members with pin, but we need all
    // Actually let's just load from the tag grid after getting photos
    // For now, fetch admin members list if admin, or use a dedicated endpoint
    const res2 = await fetch('/api/admin/members');
    if (res2.ok) {
      const data = await res2.json();
      members = data.members || [];
    }
  } catch (e) {
    // Not admin — we'll get member names from photo tags
    members = [];
  }

  renderFilter();
  renderTagPicker();
}

function renderFilter() {
  const sel = $('#filter-member');
  if (members.length === 0) return;
  sel.innerHTML = '<option value="">Everyone</option>' +
    members.map(m => `<option value="${m.id}">${esc(m.avatar_emoji || '🌱')} ${esc(m.name)}</option>`).join('');
}

function renderTagPicker() {
  const grid = $('#tag-grid');
  if (members.length === 0) {
    grid.innerHTML = '<span style="color:var(--ink-soft);font-size:13px">Loading members...</span>';
    return;
  }
  grid.innerHTML = members.map(m =>
    `<button type="button" class="tag-opt" data-member-id="${m.id}">${esc(m.avatar_emoji || '🌱')} ${esc(m.name)}</button>`
  ).join('');

  grid.querySelectorAll('.tag-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.memberId);
      if (selectedTags.has(id)) {
        selectedTags.delete(id);
        btn.classList.remove('selected');
      } else {
        selectedTags.add(id);
        btn.classList.add('selected');
      }
    });
  });
}

async function loadPhotos(append) {
  const filterMember = $('#filter-member').value;
  let url = `/api/photos?page=${currentPage}`;
  if (filterMember) url += `&member=${filterMember}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();

    if (append) {
      photos = [...photos, ...(data.photos || [])];
    } else {
      photos = data.photos || [];
    }

    renderGrid(append);

    // Show/hide load more
    const loadMore = $('#load-more');
    if ((data.photos || []).length >= 24) {
      loadMore.classList.remove('hidden');
    } else {
      loadMore.classList.add('hidden');
    }
  } catch (e) { console.error(e); }
}

function renderGrid(append) {
  const grid = $('#photo-grid');
  if (photos.length === 0) {
    grid.innerHTML = '<p class="empty" style="grid-column:1/-1;text-align:center;padding:48px;color:var(--ink-soft)">No photos yet. Add the first one!</p>';
    return;
  }

  const html = photos.map((p, i) => {
    const tagNames = p.tags.map(t => t.name).join(', ');
    return `
    <div class="photo-card" data-idx="${i}" style="animation-delay:${Math.min(i * 0.03, 0.3)}s">
      <img src="${esc(p.url)}" loading="lazy" alt="${esc(p.caption || '')}" />
      <div class="photo-card-info">
        ${p.caption ? '<div class="photo-card-caption">' + esc(p.caption) + '</div>' : ''}
        ${tagNames ? '<div class="photo-card-tags">' + esc(tagNames) + '</div>' : ''}
      </div>
    </div>`;
  }).join('');

  if (append) {
    grid.insertAdjacentHTML('beforeend', html);
  } else {
    grid.innerHTML = html;
  }

  grid.querySelectorAll('.photo-card').forEach(card => {
    card.addEventListener('click', () => {
      const idx = parseInt(card.dataset.idx);
      openViewer(photos[idx]);
    });
  });
}

function openViewer(photo) {
  $('#viewer-img').src = photo.url;
  $('#viewer-caption').textContent = photo.caption || '';
  $('#viewer-tags').innerHTML = photo.tags.map(t =>
    `<span class="viewer-tag">${esc(t.avatar_emoji || '🌱')} ${esc(t.name)}</span>`
  ).join('');

  const date = photo.taken_date || new Date(photo.created_at * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  $('#viewer-meta').textContent = `${photo.uploaded_by_name} · ${date}`;

  const actions = $('#viewer-actions');
  if (photo.uploaded_by === me.id || me.role === 'admin') {
    actions.classList.remove('hidden');
    $('#viewer-delete').onclick = () => deletePhoto(photo.id);
  } else {
    actions.classList.add('hidden');
  }

  $('#photo-viewer').classList.remove('hidden');
}

function closeViewer() {
  $('#photo-viewer').classList.add('hidden');
}

async function deletePhoto(id) {
  if (!confirm('Delete this photo?')) return;
  await fetch('/api/photos', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  closeViewer();
  currentPage = 1;
  loadPhotos();
}

function openPhotoModal() {
  selectedTags.clear();
  $$('.tag-opt').forEach(b => b.classList.remove('selected'));
  $('#photo-thumb').classList.add('hidden');
  $('#photo-upload-label').style.display = '';
  $('#photo-error').classList.add('hidden');
  $('#photo-status').classList.add('hidden');
  $('#modal-photo').classList.remove('hidden');
}

function closePhotoModal() {
  $('#modal-photo').classList.add('hidden');
  $('#photo-form').reset();
  $('#photo-thumb').classList.add('hidden');
  $('#photo-upload-label').style.display = '';
}

async function submitPhoto(e) {
  e.preventDefault();
  const file = $('#photo-file').files[0];
  if (!file) return;

  const errEl = $('#photo-error');
  const statusEl = $('#photo-status');
  errEl.classList.add('hidden');

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Uploading\u2026';
  statusEl.textContent = 'Uploading photo\u2026';
  statusEl.className = 'upload-status uploading';
  statusEl.classList.remove('hidden');

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('caption', $('#photo-caption').value.trim());
    formData.append('taken_date', $('#photo-date').value || '');
    formData.append('tags', Array.from(selectedTags).join(','));

    const res = await fetch('/api/photos', { method: 'POST', body: formData });
    const data = await res.json();

    if (res.ok) {
      statusEl.textContent = 'Added!';
      statusEl.className = 'upload-status done';
      setTimeout(() => {
        closePhotoModal();
        currentPage = 1;
        loadPhotos();
      }, 500);
    } else {
      errEl.textContent = data.error || 'Upload failed.';
      errEl.classList.remove('hidden');
      statusEl.classList.add('hidden');
    }
  } catch (err) {
    errEl.textContent = 'Network trouble. Try again.';
    errEl.classList.remove('hidden');
    statusEl.classList.add('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add to scrapbook';
  }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
