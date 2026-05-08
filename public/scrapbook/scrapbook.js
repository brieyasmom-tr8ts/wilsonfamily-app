// Scrapbook — page-flip book view

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let me = null;
let photos = [];
let members = [];
let albums = [];
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
function clearStatus() {
  const el = document.getElementById('scrap-status');
  if (el) el.textContent = '';
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
    clearStatus();
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
    await loadAlbums();
  } catch (e) {
    console.warn('Could not load albums:', e);
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

  // Album controls
  $('#new-album-btn').addEventListener('click', () => {
    $('#modal-album').classList.remove('hidden');
    setTimeout(() => $('#album-title').focus(), 100);
  });
  $$('[data-close-album]').forEach(el => el.addEventListener('click', () => {
    $('#modal-album').classList.add('hidden');
    $('#album-form').reset();
  }));
  $('#album-form').addEventListener('submit', submitAlbum);

  $('#filter-album').addEventListener('change', () => {
    currentPageIdx = 0;
    loadPhotos();
  });
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

async function loadAlbums() {
  try {
    const res = await fetch('/api/albums');
    if (!res.ok) return;
    const data = await res.json();
    albums = data.albums || [];
    renderAlbumFilter();
    renderAlbumsStrip();
  } catch (e) { console.warn('Albums not available:', e); }
}

function renderAlbumFilter() {
  const sel = $('#filter-album');
  if (!sel) return;
  // Keep first two options (All photos, Unsorted)
  const existing = sel.querySelectorAll('option');
  while (sel.options.length > 2) sel.remove(2);
  albums.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = `${a.title} (${a.photo_count})`;
    sel.appendChild(opt);
  });

  // Also update the photo upload album picker
  const photoAlbum = $('#photo-album');
  if (photoAlbum) {
    while (photoAlbum.options.length > 1) photoAlbum.remove(1);
    albums.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = a.title;
      photoAlbum.appendChild(opt);
    });
  }
}

function renderAlbumsStrip() {
  const strip = $('#albums-strip');
  if (!strip || albums.length === 0) return;
  strip.classList.remove('hidden');
  strip.innerHTML = albums.map(a => {
    const cover = a.cover_url
      ? `<img src="${esc(a.cover_url)}" class="album-cover" />`
      : '<div class="album-cover-empty">📸</div>';
    return `
      <div class="album-card" data-album-id="${a.id}">
        ${cover}
        <div class="album-info">
          <div class="album-title">${esc(a.title)}</div>
          <div class="album-count">${a.photo_count} photos</div>
        </div>
      </div>`;
  }).join('');

  strip.querySelectorAll('.album-card').forEach(card => {
    card.addEventListener('click', () => {
      const albumId = card.dataset.albumId;
      $('#filter-album').value = albumId;
      currentPageIdx = 0;
      loadPhotos();
    });
  });
}

async function submitAlbum(e) {
  e.preventDefault();
  const title = $('#album-title').value.trim();
  if (!title) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Creating\u2026';

  try {
    const res = await fetch('/api/albums', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        description: ($('#album-desc') || {}).value || ''
      })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const errEl = $('#album-error');
      errEl.textContent = data.error || 'Could not create album.';
      errEl.classList.remove('hidden');
      return;
    }
    $('#modal-album').classList.add('hidden');
    $('#album-form').reset();
    await loadAlbums();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create album';
  }
}

async function loadPhotos() {
  const filterMember = ($('#filter-member') || {}).value || '';

  const filterAlbum = ($('#filter-album') || {}).value || '';

  let allPhotos = [];
  let page = 1;
  while (page <= 20) { // safety limit
    let fetchUrl = `/api/photos?page=${page}`;
    if (filterMember) fetchUrl += `&member=${filterMember}`;
    if (filterAlbum === 'unassigned') fetchUrl += '&unassigned=1';
    else if (filterAlbum) fetchUrl += `&album=${filterAlbum}`;
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
        ${canDelete ? `<div class="page-actions"><button class="page-edit-btn" id="page-edit">Edit</button> <button class="page-del-btn" id="page-delete">Delete</button></div>` : ''}
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

  const editBtn = document.getElementById('page-edit');
  if (editBtn) editBtn.onclick = () => openEditPhoto(p);

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
    const albumVal = ($('#photo-album') || {}).value;
    if (albumVal) formData.append('album_id', albumVal);

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

function openEditPhoto(p) {
  const caption = prompt('Edit caption:', p.caption || '');
  if (caption === null) return; // cancelled

  const styleChoices = PAGE_STYLES.map(s => s.id).join(', ');
  const style = prompt('Page style (' + styleChoices + '):', p.page_style || 'classic');
  if (style === null) return;

  fetch('/api/photos/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: p.id,
      caption: caption.trim() || null,
      page_style: PAGE_STYLES.find(s => s.id === style) ? style : p.page_style
    })
  }).then(res => {
    if (res.ok) {
      p.caption = caption.trim() || null;
      if (PAGE_STYLES.find(s => s.id === style)) p.page_style = style;
      renderPage();
    }
  });
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
