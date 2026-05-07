// Family Calendar

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const EVENT_COLORS = ['#2563eb','#f59e0b','#ef4444','#10b981','#8b5cf6','#ec4899','#06b6d4','#f97316'];

let me = null;
let currentYear, currentMonth;
let allEvents = [];
let editingId = null;
let selectedColor = EVENT_COLORS[0];

(async function boot() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) { window.location.replace('/'); return; }
    const data = await res.json();
    me = data.member;
    init();
  } catch (e) { window.location.replace('/'); }
})();

function init() {
  $('#user-name').textContent = me.name;
  $('#user-emoji').textContent = me.avatar_emoji || '🌱';

  $('#signout-btn').addEventListener('click', async () => {
    await fetch('/api/auth/signout', { method: 'POST' });
    window.location.href = '/';
  });

  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth() + 1;

  $('#prev-month').addEventListener('click', () => { changeMonth(-1); });
  $('#next-month').addEventListener('click', () => { changeMonth(1); });

  // Color grid
  const cg = $('#event-color-grid');
  cg.innerHTML = EVENT_COLORS.map(c =>
    `<button type="button" class="ev-color-opt${c === selectedColor ? ' selected' : ''}" data-color="${c}" style="background:${c}"></button>`
  ).join('');
  cg.addEventListener('click', (e) => {
    const btn = e.target.closest('.ev-color-opt');
    if (!btn) return;
    selectedColor = btn.dataset.color;
    $('#event-color').value = selectedColor;
    $$('.ev-color-opt').forEach(b => b.classList.toggle('selected', b === btn));
  });

  // Modal
  $('#add-event-btn').addEventListener('click', () => openEventModal());
  $$('[data-close-event]').forEach(el => el.addEventListener('click', closeEventModal));
  $('#event-form').addEventListener('submit', submitEvent);

  loadMonth();
}

function changeMonth(delta) {
  currentMonth += delta;
  if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  if (currentMonth < 1) { currentMonth = 12; currentYear--; }
  loadMonth();
}

async function loadMonth() {
  $('#cal-month-title').textContent = `${MONTHS[currentMonth - 1]} ${currentYear}`;

  try {
    const res = await fetch(`/api/events?year=${currentYear}&month=${currentMonth}`);
    if (!res.ok) return;
    const data = await res.json();
    allEvents = [...(data.events || []), ...(data.auto_events || [])];
    renderCalendar();
    renderUpcoming();
  } catch (e) { console.error(e); }
}

function renderCalendar() {
  const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const today = new Date();
  const isThisMonth = today.getFullYear() === currentYear && today.getMonth() + 1 === currentMonth;
  const todayDate = today.getDate();

  let html = '';

  // Empty cells for days before the 1st
  for (let i = 0; i < firstDay; i++) {
    html += '<div class="cal-cell empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isToday = isThisMonth && d === todayDate;
    const dayEvents = allEvents.filter(e => e.event_date === dateStr);

    html += `<div class="cal-cell${isToday ? ' today' : ''}">`;
    html += `<div class="cal-date">${d}</div>`;
    for (const ev of dayEvents.slice(0, 3)) {
      html += `<span class="cal-event" style="background:${esc(ev.color || '#2563eb')}" title="${esc(ev.title)}">${esc(ev.title)}</span>`;
    }
    if (dayEvents.length > 3) {
      html += `<span class="cal-event" style="background:var(--ink-soft)">+${dayEvents.length - 3} more</span>`;
    }
    html += '</div>';
  }

  $('#cal-cells').innerHTML = html;
}

function renderUpcoming() {
  const list = $('#upcoming-list');
  const sorted = [...allEvents].sort((a, b) => a.event_date.localeCompare(b.event_date));

  if (sorted.length === 0) {
    list.innerHTML = '<p class="empty" style="text-align:center;color:var(--ink-soft);padding:24px">No events this month.</p>';
    return;
  }

  const isAdmin = me.role === 'admin';

  list.innerHTML = sorted.map(ev => {
    const dateObj = new Date(ev.event_date + 'T00:00:00');
    const dateStr = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const isCustom = ev.type === 'custom';
    const canEdit = isCustom && (ev.created_by === me.id || isAdmin);
    const actions = canEdit ? `
      <div class="upcoming-actions">
        <button class="del-btn" data-del-id="${ev.id}">Del</button>
      </div>` : '';
    return `
    <div class="upcoming-item">
      <div class="upcoming-dot" style="background:${esc(ev.color || '#2563eb')}"></div>
      <div class="upcoming-info">
        <div class="upcoming-title">${esc(ev.title)}</div>
        ${ev.description ? '<div class="upcoming-desc">' + esc(ev.description) + '</div>' : ''}
      </div>
      <div class="upcoming-date">${dateStr}</div>
      ${actions}
    </div>`;
  }).join('');

  list.querySelectorAll('.del-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this event?')) return;
      await fetch('/api/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: parseInt(btn.dataset.delId) })
      });
      loadMonth();
    });
  });
}

function openEventModal(event) {
  editingId = event ? event.id : null;
  $('#event-id').value = editingId || '';
  $('#event-title').value = event ? event.title : '';
  $('#event-date').value = event ? event.event_date : '';
  $('#event-end-date').value = event ? (event.end_date || '') : '';
  $('#event-desc').value = event ? (event.description || '') : '';
  $('#event-recurring').value = event ? (event.recurring || '') : '';
  $('#event-error').classList.add('hidden');

  selectedColor = event ? (event.color || EVENT_COLORS[0]) : EVENT_COLORS[0];
  $('#event-color').value = selectedColor;
  $$('.ev-color-opt').forEach(b => b.classList.toggle('selected', b.dataset.color === selectedColor));

  const btn = $('#event-form').querySelector('button[type=submit]');
  btn.textContent = editingId ? 'Save changes' : 'Save event';

  $('#modal-event').classList.remove('hidden');
  setTimeout(() => $('#event-title').focus(), 100);
}

function closeEventModal() {
  $('#modal-event').classList.add('hidden');
  $('#event-form').reset();
  editingId = null;
}

async function submitEvent(e) {
  e.preventDefault();
  const errEl = $('#event-error');
  errEl.classList.add('hidden');

  const body = {
    title: $('#event-title').value.trim(),
    event_date: $('#event-date').value,
    end_date: $('#event-end-date').value || null,
    description: $('#event-desc').value.trim() || null,
    recurring: $('#event-recurring').value || null,
    color: selectedColor
  };

  if (!body.title || !body.event_date) return;

  const method = editingId ? 'PUT' : 'POST';
  if (editingId) body.id = editingId;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Saving\u2026';

  try {
    const res = await fetch('/api/events', {
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
    closeEventModal();
    loadMonth();
  } finally {
    btn.disabled = false;
    btn.textContent = editingId ? 'Save changes' : 'Save event';
  }
}

function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}
