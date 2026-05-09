// Profile page — view/edit your own or view others

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let me = null;
let profile = null;
let isMe = false;

(async function boot() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.replace('/'); return; }
    const data = await res.json();
    me = data.member;
  } catch (e) { window.location.replace('/'); return; }

  $('#user-name').textContent = me.name;
  $('#user-emoji').textContent = me.avatar_emoji || '🌱';

  $('#back-link').addEventListener('click', () => {
    let sameOrigin = false;
    if (document.referrer) {
      try { sameOrigin = new URL(document.referrer).origin === location.origin; } catch {}
    }
    if (sameOrigin && history.length > 1) {
      history.back();
    } else {
      window.location.href = '/family-members/';
    }
  });

  // Check if viewing another member
  const params = new URLSearchParams(window.location.search);
  const viewId = params.get('id') || me.id;

  try {
    const res = await fetch(`/api/profile?id=${viewId}`);
    if (!res.ok) { window.location.replace('/'); return; }
    const data = await res.json();
    profile = data.member;
    isMe = data.is_me;
    renderProfile();
  } catch (e) { console.error(e); }
})();

function renderProfile() {
  $('#profile-avatar').textContent = profile.avatar_emoji || '🌱';
  $('#profile-name').textContent = profile.name;
  $('#profile-username').textContent = profile.username ? `@${profile.username}` : '';

  let dates = [];
  if (profile.birthday) {
    const bday = new Date(profile.birthday + 'T00:00:00');
    const age = Math.floor((Date.now() - bday.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    dates.push(`🎂 ${bday.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} (${age})`);
  }
  if (profile.anniversary) {
    const ann = new Date(profile.anniversary + 'T00:00:00');
    const years = Math.floor((Date.now() - ann.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    dates.push(`💍 ${ann.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} (${years} years)`);
  }
  $('#profile-dates').textContent = dates.join('  ·  ');

  if (isMe) {
    $('#edit-profile-btn').classList.remove('hidden');
    $('#edit-profile-btn').addEventListener('click', openEditModal);
    $$('[data-close-profile]').forEach(el => el.addEventListener('click', closeEditModal));
    $('#profile-form').addEventListener('submit', saveProfile);
  }

  renderFavorites();
}

const FAV_FIELDS = [
  { key: 'favorite_icecream', label: 'Ice cream', icon: '🍦' },
  { key: 'favorite_snack', label: 'Snack', icon: '🍿' },
  { key: 'favorite_color', label: 'Color', icon: '🎨' },
  { key: 'favorite_game', label: 'Game', icon: '🎮' },
  { key: 'favorite_movie', label: 'Movie', icon: '🎬' },
  { key: 'favorite_song', label: 'Song', icon: '🎵' },
  { key: 'favorite_hobby', label: 'Hobby', icon: '⚡' },
  { key: 'fun_fact', label: 'Fun fact', icon: '✨' },
];

function renderFavorites() {
  const grid = $('#favorites-grid');
  const hasFavs = FAV_FIELDS.some(f => profile[f.key]);

  if (!hasFavs && !isMe) {
    $('#favorites-section').classList.add('hidden');
    return;
  }

  grid.innerHTML = FAV_FIELDS.map(f => {
    const val = profile[f.key];
    return `
    <div class="fav-item">
      <span class="fav-label">${f.icon} ${f.label}</span>
      <span class="fav-value ${val ? '' : 'fav-empty'}">${esc(val || (isMe ? 'Not set' : '—'))}</span>
    </div>`;
  }).join('');
}

function openEditModal() {
  $('#edit-p-name').value = profile.name || '';
  $('#edit-p-username').value = profile.username || '';
  $('#edit-p-emoji').value = profile.avatar_emoji || '';
  $('#edit-p-birthday').value = profile.birthday || '';
  $('#edit-p-anniversary').value = profile.anniversary || '';
  $('#edit-p-icecream').value = profile.favorite_icecream || '';
  $('#edit-p-snack').value = profile.favorite_snack || '';
  $('#edit-p-color').value = profile.favorite_color || '';
  $('#edit-p-game').value = profile.favorite_game || '';
  $('#edit-p-movie').value = profile.favorite_movie || '';
  $('#edit-p-song').value = profile.favorite_song || '';
  $('#edit-p-hobby').value = profile.favorite_hobby || '';
  $('#edit-p-funfact').value = profile.fun_fact || '';
  $('#profile-error').classList.add('hidden');
  $('#modal-edit-profile').classList.remove('hidden');
}

function closeEditModal() {
  $('#modal-edit-profile').classList.add('hidden');
}

async function saveProfile(e) {
  e.preventDefault();
  const errEl = $('#profile-error');
  errEl.classList.add('hidden');

  const body = {
    name: $('#edit-p-name').value.trim(),
    username: $('#edit-p-username').value.trim(),
    avatar_emoji: $('#edit-p-emoji').value.trim() || '🌱',
    birthday: $('#edit-p-birthday').value || null,
    anniversary: $('#edit-p-anniversary').value || null,
    favorite_icecream: $('#edit-p-icecream').value.trim() || null,
    favorite_snack: $('#edit-p-snack').value.trim() || null,
    favorite_color: $('#edit-p-color').value.trim() || null,
    favorite_game: $('#edit-p-game').value.trim() || null,
    favorite_movie: $('#edit-p-movie').value.trim() || null,
    favorite_song: $('#edit-p-song').value.trim() || null,
    favorite_hobby: $('#edit-p-hobby').value.trim() || null,
    fun_fact: $('#edit-p-funfact').value.trim() || null,
  };

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Saving\u2026';

  try {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) {
      errEl.textContent = data.error || 'Could not save.';
      errEl.classList.remove('hidden');
      return;
    }
    closeEditModal();
    // Reload profile
    Object.assign(profile, body);
    renderProfile();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save profile';
  }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
