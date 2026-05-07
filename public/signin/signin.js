// Wilson Family — Sign-in page
// After successful magic-link verification, user is sent to the URL in `next` param (or /).

const $ = (sel) => document.querySelector(sel);

// If already signed in, redirect to next or home
(async () => {
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const next = new URLSearchParams(location.search).get('next') || '/';
      window.location.replace(next);
    }
  } catch (e) { /* not signed in */ }
})();

// Show error if redirected here from a failed verify
const params = new URLSearchParams(window.location.search);
const err = params.get('error');
if (err) {
  showMessage(errorText(err), true);
  // strip error param from URL but keep ?next=
  const next = params.get('next');
  const cleanUrl = next ? `?next=${encodeURIComponent(next)}` : '';
  window.history.replaceState({}, '', '/signin/' + cleanUrl);
}

function errorText(code) {
  return ({
    missing_token: 'That link was missing its token.',
    bad_token: 'We couldn\u2019t find that sign-in link.',
    token_used: 'That link was already used. Please request a new one.',
    token_expired: 'That link has expired. Please request a new one.',
    no_member: 'That email isn\u2019t set up for the family yet.',
  })[code] || 'Something went sideways. Try again?';
}

function showMessage(text, isError = false) {
  const el = $('#signin-message');
  el.textContent = text;
  el.style.color = isError ? 'var(--rose)' : 'var(--evergreen)';
}

$('#signin-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#email-input').value.trim();
  if (!email) return;

  showMessage('Sending\u2026');
  const btn = e.target.querySelector('button');
  btn.disabled = true;

  // Pass next param so the magic link redirects user to the right room after verifying
  const next = new URLSearchParams(location.search).get('next') || '/';

  try {
    const res = await fetch('/api/auth/request-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, next })
    });
    const data = await res.json();
    if (res.ok) {
      showMessage('Check your email \u2014 we sent a sign-in link.');
      $('#email-input').value = '';
    } else {
      showMessage(data.error || 'Something went wrong.', true);
    }
  } catch (e) {
    showMessage('Network trouble. Try again?', true);
  } finally {
    btn.disabled = false;
  }
});
