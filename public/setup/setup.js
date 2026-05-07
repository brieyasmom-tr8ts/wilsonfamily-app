// Profile setup page

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const EMOJIS = [
  '🌱', '🌻', '🌸', '🌊', '🔥', '⭐', '💜', '💚',
  '🎸', '📚', '🎨', '⚽', '🏀', '🎮', '🦋', '🐻',
  '☕', '🍕', '🎂', '🏔️', '🌙', '✨', '🎵', '🧸'
];

let selectedEmoji = '🌱';

// Auth gate — must be signed in
(async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) {
      window.location.replace('/');
      return;
    }
    const data = await res.json();
    // If already set up, go home
    if (data.member.profile_complete) {
      window.location.replace('/');
      return;
    }
    // Pre-fill username suggestion from name
    if (data.member.name) {
      $('#setup-username').placeholder = data.member.name.toLowerCase().replace(/\s+/g, '');
    }
  } catch (e) {
    window.location.replace('/');
  }
})();

// Render emoji grid
const grid = $('#emoji-grid');
grid.innerHTML = EMOJIS.map(e =>
  `<button type="button" class="emoji-opt${e === selectedEmoji ? ' selected' : ''}" data-emoji="${e}">${e}</button>`
).join('');

grid.addEventListener('click', (e) => {
  const btn = e.target.closest('.emoji-opt');
  if (!btn) return;
  selectedEmoji = btn.dataset.emoji;
  $('#setup-emoji').value = selectedEmoji;
  $$('.emoji-opt').forEach(b => b.classList.toggle('selected', b === btn));
});

// Submit
$('#setup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#setup-username').value.trim();
  const birthday = $('#setup-birthday').value.trim();
  const anniversary = $('#setup-anniversary').value.trim();

  const errEl = $('#setup-error');
  errEl.classList.add('hidden');

  if (!username) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Saving\u2026';

  try {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        birthday: birthday || null,
        anniversary: anniversary || null,
        avatar_emoji: selectedEmoji
      })
    });
    const data = await res.json();

    if (res.ok) {
      window.location.replace('/');
    } else {
      errEl.textContent = data.error || 'Something went wrong.';
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = 'Network trouble. Try again?';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save & enter';
  }
});
