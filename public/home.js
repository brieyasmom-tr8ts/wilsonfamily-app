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

      // Show admin panel for admins only
      if (me.role === 'admin') {
        const adminCard = $('#admin-room-card');
        if (adminCard) adminCard.classList.remove('hidden');
      }

      $('#home-signout-btn').addEventListener('click', async () => {
        await fetch('/api/auth/signout', { method: 'POST' });
        window.location.reload();
      });
    } else {
      // Not signed in — show auth section
      $('#auth-section').classList.remove('hidden');
    }
  } catch (e) {
    $('#auth-section').classList.remove('hidden');
  }
})();

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
