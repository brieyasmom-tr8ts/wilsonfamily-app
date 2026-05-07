// Wilson Family — Homepage

const $ = (sel) => document.querySelector(sel);

(async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      $('#home-user-name').textContent = data.member.name;
      $('#home-user-emoji').textContent = data.member.avatar_emoji || '🌱';
      $('#home-user-chip').classList.remove('hidden');
      $('#home-signin-link').classList.add('hidden');

      // Show the Family settings room only for parents
      if (data.member.role === 'parent') {
        const familyCard = $('#family-room-card');
        if (familyCard) familyCard.classList.remove('hidden');
      }

      $('#home-signout-btn').addEventListener('click', async () => {
        await fetch('/api/auth/signout', { method: 'POST' });
        window.location.reload();
      });
    } else {
      // Not signed in — show the join form
      $('#join-section').classList.remove('hidden');
    }
  } catch (e) {
    $('#join-section').classList.remove('hidden');
  }
})();

// Join form
$('#join-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#join-name').value.trim();
  const email = $('#join-email').value.trim();
  const code = $('#join-code').value.trim();

  const errEl = $('#join-error');
  const okEl = $('#join-success');
  errEl.classList.add('hidden');
  okEl.classList.add('hidden');

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
      okEl.textContent = 'Welcome to the family! Signing you in\u2026';
      okEl.classList.remove('hidden');
      setTimeout(() => window.location.reload(), 1000);
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
