// Wilson Family — Homepage

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

(async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      const me = data.member;

      // If profile not set up, redirect to setup
      if (!me.profile_complete) {
        window.location.replace('/setup/');
        return;
      }

      $('#home-user-name').textContent = me.name;
      $('#home-user-emoji').textContent = me.avatar_emoji || '🌱';
      $('#home-user-chip').classList.remove('hidden');
      $('#home-signin-link').classList.add('hidden');

      // Show rooms
      $('#rooms-section').classList.remove('hidden');
      $('#home-footer').classList.remove('hidden');

      // Show admin link for admins only
      if (me.role === 'admin') {
        const adminLink = $('#admin-link');
        if (adminLink) adminLink.classList.remove('hidden');
      }

      $('#home-signout-btn').addEventListener('click', async () => {
        await fetch('/api/auth/signout', { method: 'POST' });
        window.location.reload();
      });

      // Load activity feed + birthdays
      loadActivity();
    } else {
      // Not signed in — show auth section
      $('#auth-section').classList.remove('hidden');
    }
  } catch (e) {
    $('#auth-section').classList.remove('hidden');
  }
})();

// =========================================================
// ACTIVITY FEED + BIRTHDAYS
// =========================================================
async function loadActivity() {
  try {
    const res = await fetch('/api/activity');
    if (!res.ok) return;
    const data = await res.json();
    renderBirthdays(data.birthdays || []);
    renderFeed(data.feed || []);
  } catch (e) { console.error(e); }
}

function renderBirthdays(birthdays) {
  if (birthdays.length === 0) return;
  const section = $('#birthdays-section');
  const list = $('#birthdays-list');
  section.classList.remove('hidden');

  list.innerHTML = birthdays.map(b => {
    const emoji = esc(b.avatar_emoji || '🌱');
    const name = esc(b.name);
    let label;
    if (b.days_away === 0) label = '<strong class="bday-today">Today!</strong>';
    else if (b.days_away === 1) label = 'Tomorrow';
    else label = `in ${b.days_away} days`;
    return `
      <div class="bday-card">
        <span class="bday-emoji">${emoji}</span>
        <span class="bday-name">${name}</span>
        <span class="bday-when">🎂 ${label}</span>
      </div>`;
  }).join('');
}

function renderFeed(feed) {
  if (feed.length === 0) return;
  if (sessionStorage.getItem('dismiss_activity')) return;
  const section = $('#activity-section');
  const container = $('#activity-feed');
  section.classList.remove('hidden');

  $('#dismiss-activity').addEventListener('click', () => {
    section.classList.add('hidden');
    sessionStorage.setItem('dismiss_activity', '1');
  });

  container.innerHTML = feed.map(item => {
    const emoji = esc(item.avatar_emoji || '🌱');
    const name = esc(item.name);
    const desc = activityDescription(item);
    return `
      <div class="activity-item">
        <span class="activity-emoji">${emoji}</span>
        <span class="activity-text"><strong>${name}</strong> ${desc}</span>
        <span class="activity-time">${timeAgo(item.created_at)}</span>
      </div>`;
  }).join('');
}

function activityDescription(item) {
  switch (item.type) {
    case 'contribution':
      return `added <strong>$${((item.amount_cents || 0) / 100).toFixed(2)}</strong> to the generosity pot`;
    case 'prayer':
      return `posted a prayer`;
    case 'praise':
      return `shared a praise`;
    case 'prayer_answered':
      return `marked a prayer as answered`;
    case 'rock':
      return `placed a rock: <em>"${esc(item.word)}"</em>`;
    case 'photo':
      return item.caption ? `added a scrapbook photo: "${esc(item.caption)}"` : 'added a photo to the scrapbook';
    case 'suggestion':
      return `suggested blessing <em>${esc(item.recipient_name)}</em>`;
    case 'list_item':
      return `added "${esc(truncate(item.text, 40))}" to ${esc(item.list_title)}`;
    case 'verse_game': {
      const gameNames = { scramble: 'Word Scramble', erase: 'Erase the Board', speed: 'Speed Round', typeit: 'Type It Out', missing: 'Missing Word', backwards: 'Backwards Build' };
      const gn = gameNames[item.game_type] || item.game_type;
      const time = item.score_ms ? ` in <strong>${(item.score_ms / 1000).toFixed(1)}s</strong>` : '';
      const pct = item.score_pct ? ` — <strong>${item.score_pct}%</strong>` : '';
      return `played ${gn}${time}${pct}`;
    }
    default:
      return 'did something';
  }
}

function truncate(s, len) {
  if (!s) return '';
  return s.length > len ? s.slice(0, len) + '...' : s;
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function timeAgo(unix) {
  const seconds = Math.floor(Date.now() / 1000) - unix;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d`;
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Auth tab switching
$$('[data-auth-tab]').forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.authTab;
    $$('[data-auth-tab]').forEach(t => t.classList.toggle('active', t === tab));
    $('#auth-signin').classList.toggle('hidden', target !== 'signin');
    $('#auth-join').classList.toggle('hidden', target !== 'join');
  });
});

// Sign in form (returning users)
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('#login-username').value.trim();
  const code = $('#login-code').value.trim();
  const errEl = $('#login-error');
  errEl.classList.add('hidden');

  if (!username || !code) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Signing in\u2026';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, code })
    });
    const data = await res.json();

    if (res.ok) {
      if (data.needs_setup) {
        window.location.replace('/setup/');
      } else {
        window.location.reload();
      }
    } else {
      errEl.textContent = data.error || 'Could not sign in.';
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = 'Network trouble. Try again?';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign in';
  }
});

// Join form (first time)
$('#join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#join-name').value.trim();
  const email = $('#join-email').value.trim();
  const code = $('#join-code').value.trim();
  const errEl = $('#join-error');
  errEl.classList.add('hidden');

  if (!name || !email || !code) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Joining\u2026';

  try {
    const res = await fetch('/api/auth/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, code })
    });
    const data = await res.json();

    if (res.ok) {
      window.location.replace('/setup/');
    } else {
      errEl.textContent = data.error || 'Could not join. Check the code and try again.';
      errEl.classList.remove('hidden');
    }
  } catch (err) {
    errEl.textContent = 'Network trouble. Try again?';
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Join the family';
  }
});
