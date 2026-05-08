// Rocks of Remembrance — word cloud + story viewer

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const ROCK_COLORS = [
  '#1e3a5f', '#2d5a27', '#7c3238', '#4a3b6b', '#2c5f5c',
  '#8b6914', '#3d4f7c', '#6b3a3a', '#1f5f4f', '#5c4a1e',
  '#3b3b3b', '#64748b'
];

const SIZES = ['size-sm', 'size-md', 'size-lg'];
const TILTS = ['tilt-1', 'tilt-2', 'tilt-3', 'tilt-4', 'tilt-5'];

let me = null;
let rocks = [];
let selectedColor = ROCK_COLORS[0];
let selectedType = 'text';
let editingId = null;
let uploadedMediaUrl = null;
let isUploading = false;
let mediaRecorder = null;
let recordChunks = [];

// Boot
(async function boot() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.replace('/');
      return;
    }
    const data = await res.json();
    me = data.member;
    init();
  } catch (e) {
    window.location.replace('/');
  }
})();

function init() {
  $('#user-name').textContent = me.name;
  $('#user-emoji').textContent = me.avatar_emoji || '🌱';

  $('#signout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/';
  });

  // Color grid
  const colorGrid = $('#color-grid');
  colorGrid.innerHTML = ROCK_COLORS.map(c =>
    `<button type="button" class="color-opt${c === selectedColor ? ' selected' : ''}" data-color="${c}" style="background:${c}"></button>`
  ).join('');
  colorGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.color-opt');
    if (!btn) return;
    selectedColor = btn.dataset.color;
    $('#rock-color').value = selectedColor;
    $$('.color-opt').forEach(b => b.classList.toggle('selected', b === btn));
  });

  // Story type tabs
  $$('.story-type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      selectedType = tab.dataset.type;
      $$('.story-type-tab').forEach(t => t.classList.toggle('active', t === tab));
      $('#story-input-text').classList.toggle('hidden', selectedType !== 'text');
      $('#story-input-video').classList.toggle('hidden', selectedType !== 'video');
      $('#story-input-audio').classList.toggle('hidden', selectedType !== 'audio');
    });
  });

  // File upload handlers
  $('#rock-video-file').addEventListener('change', (e) => handleFileSelect(e, 'video'));
  $('#rock-audio-file').addEventListener('change', (e) => handleFileSelect(e, 'audio'));

  // Recording
  $('#record-audio-btn').addEventListener('click', () => startRecording('audio'));
  $('#stop-recording-btn').addEventListener('click', stopRecording);
  $('#record-video-btn').addEventListener('click', () => startRecording('video'));
  $('#stop-video-btn').addEventListener('click', stopRecording);

  // Modal
  $('#add-rock-btn').addEventListener('click', () => openRockModal());
  $$('[data-close-rock]').forEach(el => el.addEventListener('click', closeRockModal));
  $('#rock-form').addEventListener('submit', submitRock);

  // Story overlay
  $('#story-close').addEventListener('click', closeStory);
  $('.story-backdrop').addEventListener('click', closeStory);

  loadRocks();
}

async function loadRocks() {
  try {
    const res = await fetch('/api/rocks');
    if (!res.ok) return;
    const data = await res.json();
    rocks = data.rocks || [];
    renderCloud();
  } catch (e) {
    console.error(e);
  }
}

function renderCloud() {
  const cloud = $('#rock-cloud');
  const empty = $('#empty-rocks');

  if (rocks.length === 0) {
    empty.classList.remove('hidden');
    cloud.innerHTML = '';
    cloud.appendChild(empty);
    return;
  }

  empty.classList.add('hidden');

  cloud.innerHTML = rocks.map((r, i) => {
    // Vary sizes based on word length and position
    const len = r.word.length;
    const sizeClass = len <= 8 ? SIZES[2] : len <= 16 ? SIZES[1] : SIZES[0];
    const tiltClass = TILTS[i % TILTS.length];
    return `<button class="rock-stone ${sizeClass} ${tiltClass}" data-id="${r.id}" style="background:${esc(r.color || '#64748b')}">${esc(r.word)}</button>`;
  }).join('');

  cloud.querySelectorAll('.rock-stone').forEach(btn => {
    btn.addEventListener('click', () => {
      const rock = rocks.find(r => r.id === parseInt(btn.dataset.id));
      if (rock) openStory(rock);
    });
  });
}

function openStory(rock) {
  $('#story-rock-word').textContent = rock.word;
  $('#story-rock-word').style.color = rock.color || '#64748b';
  $('#story-author').textContent = `${rock.avatar_emoji || '🌱'} ${rock.author_name} · ${timeAgo(rock.created_at)}`;

  const content = $('#story-content');
  if (rock.media_type === 'video' && rock.media_url) {
    const isUpload = rock.media_url.startsWith('/api/media/');
    const mediaHtml = isUpload
      ? `<video src="${esc(rock.media_url)}" controls playsinline style="width:100%;border-radius:12px;margin-top:8px"></video>`
      : `<iframe src="${esc(toEmbed(rock.media_url))}" allowfullscreen loading="lazy"></iframe>`;
    content.innerHTML = (rock.story ? `<p>${escLines(rock.story)}</p>` : '') + mediaHtml;
  } else if (rock.media_type === 'audio' && rock.media_url) {
    content.innerHTML = (rock.story ? `<p>${escLines(rock.story)}</p>` : '') +
      `<audio controls src="${esc(rock.media_url)}" style="width:100%;margin-top:8px"></audio>`;
  } else if (rock.story) {
    content.innerHTML = `<p>${escLines(rock.story)}</p>`;
  } else {
    content.innerHTML = '<p class="story-empty">No story added yet.</p>';
  }

  // Show edit/delete for owner or admin
  const actions = $('#story-actions');
  if (rock.created_by === me.id || me.role === 'admin') {
    actions.classList.remove('hidden');
    $('#story-edit').onclick = () => { closeStory(); openRockModal(rock); };
    $('#story-delete').onclick = () => deleteRock(rock.id);
  } else {
    actions.classList.add('hidden');
  }

  $('#story-overlay').classList.remove('hidden');
}

function closeStory() {
  $('#story-overlay').classList.add('hidden');
}

function openRockModal(rock) {
  editingId = rock ? rock.id : null;
  uploadedMediaUrl = null;
  $('#rock-id').value = editingId || '';
  $('#rock-word').value = rock ? rock.word : '';
  $('#rock-story').value = rock && rock.media_type === 'text' ? (rock.story || '') : '';
  $('#rock-video-story').value = rock && rock.media_type === 'video' ? (rock.story || '') : '';
  $('#rock-audio-story').value = rock && rock.media_type === 'audio' ? (rock.story || '') : '';
  $('#rock-media-url').value = rock ? (rock.media_url || '') : '';
  $('#rock-error').classList.add('hidden');
  $('#video-preview').classList.add('hidden');
  $('#audio-preview').classList.add('hidden');
  $('#video-upload-status').classList.add('hidden');
  $('#audio-upload-status').classList.add('hidden');
  if (rock && rock.media_url) uploadedMediaUrl = rock.media_url;

  // Set color
  selectedColor = rock ? (rock.color || ROCK_COLORS[0]) : ROCK_COLORS[0];
  $('#rock-color').value = selectedColor;
  $$('.color-opt').forEach(b => b.classList.toggle('selected', b.dataset.color === selectedColor));

  // Set story type
  selectedType = rock ? (rock.media_type || 'text') : 'text';
  $$('.story-type-tab').forEach(t => t.classList.toggle('active', t.dataset.type === selectedType));
  $('#story-input-text').classList.toggle('hidden', selectedType !== 'text');
  $('#story-input-video').classList.toggle('hidden', selectedType !== 'video');
  $('#story-input-audio').classList.toggle('hidden', selectedType !== 'audio');

  const submitBtn = $('#rock-form').querySelector('button[type=submit]');
  submitBtn.textContent = editingId ? 'Save changes' : 'Place this rock';

  $('#modal-rock').classList.remove('hidden');
  setTimeout(() => $('#rock-word').focus(), 100);
}

function closeRockModal() {
  $('#modal-rock').classList.add('hidden');
  $('#rock-form').reset();
  editingId = null;
}

async function submitRock(e) {
  e.preventDefault();
  const word = $('#rock-word').value.trim();
  if (!word) return;

  const errEl = $('#rock-error');
  errEl.classList.add('hidden');

  if (isUploading) {
    errEl.textContent = 'Please wait for the upload to finish.';
    errEl.classList.remove('hidden');
    return;
  }

  const mediaUrl = $('#rock-media-url').value || uploadedMediaUrl || null;

  // If they selected video/audio but didn't upload anything, warn
  if ((selectedType === 'video' || selectedType === 'audio') && !mediaUrl && !editingId) {
    errEl.textContent = 'Please record or upload your ' + selectedType + ' first, or switch to "Write it".';
    errEl.classList.remove('hidden');
    return;
  }

  const storyText = selectedType === 'text' ? $('#rock-story').value.trim() :
                     selectedType === 'video' ? $('#rock-video-story').value.trim() :
                     $('#rock-audio-story').value.trim();

  const body = {
    word,
    color: selectedColor,
    media_type: selectedType,
    story: storyText || null,
    media_url: (selectedType === 'video' || selectedType === 'audio') ? mediaUrl : null
  };

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = editingId ? 'Saving\u2026' : 'Placing\u2026';

  try {
    const method = editingId ? 'PUT' : 'POST';
    if (editingId) body.id = editingId;

    const res = await fetch('/api/rocks', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      errEl.textContent = data.error || 'Something went wrong.';
      errEl.classList.remove('hidden');
      return;
    }
    closeRockModal();
    loadRocks();
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? 'Save changes' : 'Place this rock';
  }
}

async function deleteRock(id) {
  if (!confirm('Remove this rock?')) return;
  await fetch('/api/rocks', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  });
  closeStory();
  loadRocks();
}

// File upload
async function handleFileSelect(e, type) {
  const file = e.target.files[0];
  if (!file) return;

  const previewEl = $(`#${type}-preview`);
  const statusEl = $(`#${type}-upload-status`);
  const submitBtn = $('#rock-form').querySelector('button[type=submit]');

  // Show preview
  const url = URL.createObjectURL(file);
  previewEl.classList.remove('hidden');
  if (type === 'video') {
    previewEl.innerHTML = `<video src="${url}" controls playsinline></video>`;
  } else {
    previewEl.innerHTML = `<audio src="${url}" controls></audio>`;
  }

  // Disable submit during upload
  isUploading = true;
  submitBtn.disabled = true;
  submitBtn.textContent = 'Uploading media\u2026';
  statusEl.textContent = 'Uploading\u2026 please wait';
  statusEl.className = 'upload-status uploading';
  statusEl.classList.remove('hidden');

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (res.ok) {
      uploadedMediaUrl = data.url;
      $('#rock-media-url').value = data.url;
      statusEl.textContent = 'Uploaded! Ready to save.';
      statusEl.className = 'upload-status done';
    } else {
      statusEl.textContent = data.error || 'Upload failed. Try again.';
      statusEl.className = 'upload-status error';
      uploadedMediaUrl = null;
    }
  } catch (err) {
    statusEl.textContent = 'Upload failed. Try again.';
    statusEl.className = 'upload-status error';
    uploadedMediaUrl = null;
  } finally {
    isUploading = false;
    submitBtn.disabled = false;
    submitBtn.textContent = editingId ? 'Save changes' : 'Place this rock';
  }
}

// Recording (audio or video)
let recordingType = null;

async function startRecording(type) {
  recordingType = type;
  try {
    const constraints = type === 'video'
      ? { audio: true, video: { facingMode: 'user' } }
      : { audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    recordChunks = [];
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordChunks.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const mimeType = type === 'video' ? 'video/webm' : 'audio/webm';
      const blob = new Blob(recordChunks, { type: mimeType });
      const file = new File([blob], `recording.webm`, { type: mimeType });

      const previewEl = $(`#${type}-preview`);
      previewEl.classList.remove('hidden');
      if (type === 'video') {
        previewEl.innerHTML = `<video src="${URL.createObjectURL(blob)}" controls playsinline style="width:100%;border-radius:12px"></video>`;
      } else {
        previewEl.innerHTML = `<audio src="${URL.createObjectURL(blob)}" controls style="width:100%"></audio>`;
      }

      // Hide recording controls, show options again
      const controlsId = type === 'video' ? '#video-recording-controls' : '#recording-controls';
      $(controlsId).classList.add('hidden');
      const optionsEl = $(controlsId).previousElementSibling;
      if (optionsEl) optionsEl.style.display = '';

      // Upload
      const fakeEvent = { target: { files: [file] } };
      handleFileSelect(fakeEvent, type);
    };

    // Hide options, show recording controls
    const controlsId = type === 'video' ? '#video-recording-controls' : '#recording-controls';
    $(controlsId).classList.remove('hidden');
    const optionsEl = $(controlsId).previousElementSibling;
    if (optionsEl) optionsEl.style.display = 'none';

    mediaRecorder.start();
  } catch (e) {
    const what = type === 'video' ? 'camera and microphone' : 'microphone';
    alert(`Could not access ${what}. Please allow access and try again.`);
    console.error('Recording error:', e);
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
}

// Helpers
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function escLines(s) {
  return esc(s).replace(/\n/g, '<br>');
}

function timeAgo(unix) {
  const seconds = Math.floor(Date.now() / 1000) - unix;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function toEmbed(url) {
  // YouTube
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  // Vimeo
  const vm = url.match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return url;
}
