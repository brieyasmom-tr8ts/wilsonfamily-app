// Wilson Family — Homepage
// Just checks auth state to show/hide the right header chip

(async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      document.getElementById('home-user-name').textContent = data.member.name;
      document.getElementById('home-user-emoji').textContent = data.member.avatar_emoji || '🌱';
      document.getElementById('home-user-chip').classList.remove('hidden');
      document.getElementById('home-signin-link').classList.add('hidden');

      // Show the Family settings room only for parents
      if (data.member.role === 'parent') {
        const familyCard = document.getElementById('family-room-card');
        if (familyCard) familyCard.classList.remove('hidden');
      }

      document.getElementById('home-signout-btn').addEventListener('click', async () => {
        await fetch('/api/auth/signout', { method: 'POST' });
        window.location.reload();
      });
    }
  } catch (e) { /* not signed in, leave defaults */ }
})();
