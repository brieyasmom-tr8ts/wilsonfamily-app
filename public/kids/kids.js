// Kids sign-in — tile grid + PIN pad

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let selectedKid = null;
let pinDigits = [];
let submitting = false;

(async function boot() {
  // If already signed in, go home
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) { window.location.replace('/'); return; }
  } catch (e) { /* not signed in, good */ }

  loadKids();
})();

async function loadKids() {
  try {
    const res = await fetch('/api/kids');
    if (!res.ok) return;
    const data = await res.json();
    if (!data.kids || data.kids.length === 0) {
      $('#no-kids').classList.remove('hidden');
      return;
    }
    renderGrid(data.kids);
  } catch (e) {
    console.error('Failed to load kids', e);
  }
}

function renderGrid(kids) {
  const grid = $('#kid-grid');
  grid.innerHTML = kids.map(k => `
    <button class="kid-tile" data-id="${k.id}" data-name="${escapeAttr(k.name)}" data-emoji="${escapeAttr(k.avatar_emoji || '🌱')}">
      <div class="kid-tile-emoji">${escapeHtml(k.avatar_emoji || '🌱')}</div>
      <div class="kid-tile-name">${escapeHtml(k.name)}</div>
    </button>
  `).join('');

  grid.querySelectorAll('.kid-tile').forEach(tile => {
    tile.addEventListener('click', () => selectKid(tile));
  });
}

function selectKid(tile) {
  selectedKid = {
    id: parseInt(tile.dataset.id, 10),
    name: tile.dataset.name,
    emoji: tile.dataset.emoji
  };
  pinDigits = [];
  submitting = false;

  $('#pin-avatar').textContent = selectedKid.emoji;
  $('#pin-name-text').textContent = selectedKid.name;
  updateDots();
  hideError();

  $('#step-pick').classList.add('hidden');
  $('#step-pin').classList.remove('hidden');
}

$('#back-btn').addEventListener('click', goBack);

function goBack() {
  selectedKid = null;
  pinDigits = [];
  submitting = false;
  $('#step-pin').classList.add('hidden');
  $('#step-pick').classList.remove('hidden');
}

// PIN pad
$$('.pin-key[data-key]').forEach(key => {
  key.addEventListener('click', () => {
    if (submitting) return;
    hideError();
    const digit = key.dataset.key;
    if (pinDigits.length < 4) {
      pinDigits.push(digit);
      updateDots();
      if (pinDigits.length === 4) {
        submitPin();
      }
    }
  });
});

$('#pin-delete').addEventListener('click', () => {
  if (submitting) return;
  hideError();
  pinDigits.pop();
  updateDots();
});

// Keyboard support
document.addEventListener('keydown', (e) => {
  if ($('#step-pin').classList.contains('hidden')) return;
  if (submitting) return;

  if (/^\d$/.test(e.key) && pinDigits.length < 4) {
    hideError();
    pinDigits.push(e.key);
    updateDots();
    if (pinDigits.length === 4) submitPin();
  } else if (e.key === 'Backspace') {
    hideError();
    pinDigits.pop();
    updateDots();
  } else if (e.key === 'Escape') {
    goBack();
  }
});

function updateDots() {
  $$('#pin-dots .dot').forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinDigits.length);
  });
}

async function submitPin() {
  if (!selectedKid || pinDigits.length !== 4) return;
  submitting = true;

  const pin = pinDigits.join('');

  try {
    const res = await fetch('/api/auth/pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id: selectedKid.id, pin })
    });

    const data = await res.json();

    if (res.ok) {
      window.location.replace('/');
      return;
    }

    // Wrong PIN — shake and show error
    showError(data.error || 'Wrong PIN');
    const dots = $('#pin-dots');
    dots.classList.add('shake');
    setTimeout(() => dots.classList.remove('shake'), 500);

    pinDigits = [];
    updateDots();
  } catch (e) {
    showError('Something went wrong. Try again.');
    pinDigits = [];
    updateDots();
  } finally {
    submitting = false;
  }
}

function showError(msg) {
  const el = $('#pin-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError() {
  $('#pin-error').classList.add('hidden');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function escapeAttr(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
