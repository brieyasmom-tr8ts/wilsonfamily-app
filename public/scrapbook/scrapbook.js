// Scrapbook — page-flip book view

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let me = null;
let photos = [];
let members = [];
let selectedTags = new Set();
let currentPageIdx = 0;
let selectedStyle = 'classic';

const PAGE_STYLES = [
  { id: 'classic', label: 'Classic' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'vacation', label: 'Vacation' },
  { id: 'cozy', label: 'Cozy' },
  { id: 'bold', label: 'Bold' },
  { id: 'rustic', label: 'Rustic' },
  { id: 'celebrate', label: 'Party' },
  { id: 'night', label: 'Night' },
  { id: 'garden', label: 'Garden' },
  { id: 'washi', label: 'Washi' },
];

function showStatus(msg) {
  const el = document.getElementById('scrap-status');
  if (el) el.textContent = msg;
  console.log('[scrapbook]', msg);
}

window.addEventListener('error', (e) => {
  showStatus('JS Error: ' + e.message);
  e.preventDefault();
});
window.addEventListener('unhandledrejection', (e) => {
  showStatus('Async Error: ' + (e.reason?.message || e.reason));
  e.preventDefault();
});

(async function boot() {
  showStatus('Checking auth...');
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      showStatus('Not signed in. Please sign in first.');
      return;
    }
    const data = await res.json();
    me = data.member;
    showStatus('Welcome, ' + me.name + '! Loading scrapbook...');
  } catch (e) {
    showStatus('Could not connect: ' + e.message);
    return;
  }

  try {
    initUI();
  } catch (e) {
    showStatus('UI Error: ' + e.message);
    return;
  }

  try {
    await loadMembers();
  } catch (e) {
    console.warn('Could not load members:', e);
  }

  try {
    await loadPhotos();
  } catch (e) {
    showStatus('Error loading photos: ' + e.message);
  }
})();

function initUI() {
  $('#user-name').textContent = me.name;
  $('#user-emoji').textContent = me.avatar_emoji || '🌱';

  $('#signout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/';
  });

  $('#photo-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const thumb = $('#photo-thumb');
    thumb.src = URL.createObjectURL(file);
    thumb.classList.remove('hidden');
    $('#photo-upload-label').style.display = 'none';
  });

  // Style picker
  const stylePicker = $('#style-picker');
  if (stylePicker) {
    stylePicker.innerHTML = PAGE_STYLES.map(s =>
      `<div class="style-opt${s.id === selectedStyle ? ' selected' : ''}" data-style="${s.id}">${s.label}</div>`
    ).join('');
    stylePicker.addEventListener('click', (e) => {
      const opt = e.target.closest('.style-opt');
      if (!opt) return;
      selectedStyle = opt.dataset.style;
      $('#photo-style').value = selectedStyle;
      stylePicker.querySelectorAll('.style-opt').forEach(o => o.classList.toggle('selected', o === opt));
    });
  }

  $('#add-photo-btn').addEventListener('click', openPhotoModal);
  $$('[data-close-photo]').forEach(el => el.addEventListener('click', closePhotoModal));
  $('#photo-form').addEventListener('submit', submitPhoto);

  $('#filter-member').addEventListener('change', () => {
    currentPageIdx = 0;
    loadPhotos();
  });
}

async function loadMembers() {
  try {
    let res = await fetch('/api/admin/members');
    if (res.ok) {
      const data = await res.json();
      members = data.members || [];
    } else {
      res = await fetch('/api/invites');
      if (res.ok) {
        const data = await res.json();
        members = data.members || [];
      }
    }
  } catch (e) { members = []; }
  renderFilter();
  renderTagPicker();
}

function renderFilter() {
  const sel = $('#filter-member');
  if (!sel || members.length === 0) return;
  sel.innerHTML = '<option value="">Everyone</option>' +
    members.map(m => `<option value="${m.id}">${esc(m.avatar_emoji || '🌱')} ${esc(m.name)}</option>`).join('');
}

function renderTagPicker() {
  const grid = $('#tag-grid');
  if (!grid || members.length === 0) return;
  grid.innerHTML = members.map(m =>
    `<button type="button" class="tag-opt" data-member-id="${m.id}">${esc(m.avatar_emoji || '🌱')} ${esc(m.name)}</button>`
  ).join('');
  grid.querySelectorAll('.tag-opt').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.memberId);
      if (selectedTags.has(id)) { selectedTags.delete(id); btn.classList.remove('selected'); }
      else { selectedTags.add(id); btn.classList.add('selected'); }
    });
  });
}

async function loadPhotos() {
  const filterMember = ($('#filter-member') || {}).value || '';

  let allPhotos = [];
  let page = 1;
  while (page <= 20) { // safety limit
    let fetchUrl = `/api/photos?page=${page}`;
    if (filterMember) fetchUrl += `&member=${filterMember}`;
    const res = await fetch(fetchUrl);
    if (!res.ok) break;
    const data = await res.json();
    if (!data.photos || data.photos.length === 0) break;
    allPhotos = allPhotos.concat(data.photos);
    if (data.photos.length < 24) break;
    page++;
  }

  photos = allPhotos.sort((a, b) => a.created_at - b.created_at);
  currentPageIdx = photos.length > 0 ? photos.length - 1 : 0;
  renderBook();
}

function renderBook() {
  const grid = $('#photo-grid');
  if (!grid) return;
  if (photos.length === 0) {
    grid.innerHTML = `
      <div class="book">
        <div class="book-empty">
          <div class="book-empty-icon">📸</div>
          <div class="book-empty-text">The scrapbook is empty.<br>Add the first memory!</div>
        </div>
      </div>`;
    return;
  }
  renderPage();
}

function renderPage() {
  const grid = $('#photo-grid');
  if (!grid) return;
  const p = photos[currentPageIdx];
  if (!p) return;

  const canDelete = p.uploaded_by === me.id || me.role === 'admin';
  const dateStr = p.taken_date
    ? new Date(p.taken_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date(p.created_at * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const style = p.page_style || 'classic';
  grid.innerHTML = `
    <div class="book">
      <div class="page page-style-${esc(style)}">
        <div class="page-photo-wrap">
          <img class="page-photo" src="${esc(p.url)}" alt="${esc(p.caption || '')}" />
        </div>
        ${p.caption ? `<div class="page-caption">${esc(p.caption)}</div>` : ''}
        ${p.tags.length > 0 ? `<div class="page-tags">${p.tags.map(t => `<span class="page-tag">${esc(t.avatar_emoji || '🌱')} ${esc(t.name)}</span>`).join('')}</div>` : ''}
        <div class="page-meta">${esc(p.uploaded_by_name)} · ${dateStr}</div>
        <div class="page-number">Page ${currentPageIdx + 1} of ${photos.length}</div>
        ${canDelete ? `<div class="page-actions"><button class="page-del-btn" id="page-delete">Delete this page</button></div>` : ''}
      </div>
      <div class="page-nav">
        <button class="page-nav-btn" id="prev-page" ${currentPageIdx === 0 ? 'disabled' : ''}>&larr; Previous</button>
        <span class="page-indicator">${currentPageIdx + 1} / ${photos.length}</span>
        <button class="page-nav-btn" id="next-page" ${currentPageIdx === photos.length - 1 ? 'disabled' : ''}>Next &rarr;</button>
      </div>
    </div>`;

  const prevBtn = document.getElementById('prev-page');
  const nextBtn = document.getElementById('next-page');
  if (prevBtn) prevBtn.onclick = () => { if (currentPageIdx > 0) { currentPageIdx--; renderPage(); } };
  if (nextBtn) nextBtn.onclick = () => { if (currentPageIdx < photos.length - 1) { currentPageIdx++; renderPage(); } };

  const delBtn = document.getElementById('page-delete');
  if (delBtn) delBtn.onclick = () => deletePhoto(p.id);

  document.onkeydown = (e) => {
    if (e.key === 'ArrowLeft' && currentPageIdx > 0) { currentPageIdx--; renderPage(); }
    if (e.key === 'ArrowRight' && currentPageIdx < photos.length - 1) { currentPageIdx++; renderPage(); }
  };

  const book = grid.querySelector('.book');
  if (book) {
    let touchStartX = 0;
    book.ontouchstart = (e) => { touchStartX = e.touches[0].clientX; };
    book.ontouchend = (e) => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 50) {
        if (diff > 0 && currentPageIdx < photos.length - 1) { currentPageIdx++; renderPage(); }
        if (diff < 0 && currentPageIdx > 0) { currentPageIdx--; renderPage(); }
      }
    };
  }
}

async function deletePhoto(id) {
  if (!confirm('Delete this page from the scrapbook?')) return;
  await fetch('/api/photos', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  photos = photos.filter(p => p.id !== id);
  if (currentPageIdx >= photos.length) currentPageIdx = Math.max(0, photos.length - 1);
  renderBook();
}

function openPhotoModal() {
  selectedTags.clear();
  $$('.tag-opt').forEach(b => b.classList.remove('selected'));
  const thumb = $('#photo-thumb');
  if (thumb) thumb.classList.add('hidden');
  const label = $('#photo-upload-label');
  if (label) label.style.display = '';
  const err = $('#photo-error');
  if (err) err.classList.add('hidden');
  const status = $('#photo-status');
  if (status) status.classList.add('hidden');
  $('#modal-photo').classList.remove('hidden');
}

function closePhotoModal() {
  $('#modal-photo').classList.add('hidden');
  $('#photo-form').reset();
  const thumb = $('#photo-thumb');
  if (thumb) thumb.classList.add('hidden');
  const label = $('#photo-upload-label');
  if (label) label.style.display = '';
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
    formData.append('caption', ($('#photo-caption') || {}).value || '');
    formData.append('taken_date', ($('#photo-date') || {}).value || '');
    formData.append('tags', Array.from(selectedTags).join(','));
    formData.append('page_style', selectedStyle);

    const res = await fetch('/api/photos', { method: 'POST', body: formData });
    const data = await res.json();

    if (res.ok) {
      statusEl.textContent = 'Added!';
      statusEl.className = 'upload-status done';
      setTimeout(() => {
        closePhotoModal();
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
