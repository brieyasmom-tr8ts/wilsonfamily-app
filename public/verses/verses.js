// Memory Verse Room

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let me = null;
let verse = null;
let activities = [];
let myProgress = [];
let familyProgress = [];
let recordings = [];
let currentWeek = 1;
let isUploading = false;
let uploadedMediaUrl = null;

// Audio recording state
let audioRecorder = null;
let audioChunks = [];
let isRecording = false;

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

  // Set verse modal
  $$('[data-close-verse]').forEach(el => el.addEventListener('click', () => {
    $('#modal-verse').classList.add('hidden');
    $('#verse-form').reset();
  }));
  $('#verse-form').addEventListener('submit', submitVerse);

  // Show set verse buttons for admin
  if (me.role === 'admin') {
    const btn1 = $('#set-verse-btn-empty');
    const btn2 = $('#set-verse-btn');
    if (btn1) { btn1.classList.remove('hidden'); btn1.onclick = openVerseModal; }
    if (btn2) { btn2.classList.remove('hidden'); btn2.onclick = openVerseModal; }
  }

  // Recording buttons
  $('#record-video-btn').addEventListener('click', () => {
    $('#media-file').accept = 'video/*';
    $('#media-file').click();
  });
  $('#record-audio-btn').addEventListener('click', startAudioRecording);
  $('#media-file').addEventListener('change', handleMediaFile);

  // Practice games menu
  $$('.game-menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!verse) return;
      const game = btn.dataset.game;
      if (game === 'scramble') openScrambleGame();
      else if (game === 'erase') openEraseGame();
      else if (game === 'speed') openSpeedGame();
      else if (game === 'typeit') openTypeItGame();
    });
  });

  // Archive
  $('#show-archive-btn').addEventListener('click', loadArchive);

  loadVerse();
}

async function loadVerse() {
  try {
    const res = await fetch('/api/verses');
    if (!res.ok) return;
    const data = await res.json();
    verse = data.verse;
    activities = data.activities || [];
    myProgress = data.my_progress || [];
    familyProgress = data.family_progress || [];
    recordings = data.recordings || [];
    currentWeek = data.current_week || 1;
    render();
  } catch (e) { console.error(e); }
}

function render() {
  if (!verse) {
    $('#no-verse').classList.remove('hidden');
    $('#verse-display').classList.add('hidden');
    return;
  }

  $('#no-verse').classList.add('hidden');
  $('#verse-display').classList.remove('hidden');

  // Month label
  const [year, month] = verse.month.split('-');
  const monthName = new Date(year, month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  $('#verse-month-label').textContent = monthName + ' Memory Verse';
  $('#verse-reference').textContent = verse.reference;
  $('#verse-text').textContent = verse.text;

  renderFamilyBoard();
  renderActivities();
  renderRecordings();
}

function renderFamilyBoard() {
  const board = $('#family-board');

  // Group progress by member
  const memberMap = {};
  for (const fp of familyProgress) {
    if (!memberMap[fp.member_id]) {
      memberMap[fp.member_id] = { name: fp.name, avatar_emoji: fp.avatar_emoji, activities: new Set(), memorized: false };
    }
    if (fp.activity_id) {
      memberMap[fp.member_id].activities.add(fp.activity_id);
    } else {
      memberMap[fp.member_id].memorized = true;
    }
  }

  // Add self if not in map
  if (!memberMap[me.id]) {
    memberMap[me.id] = { name: me.name, avatar_emoji: me.avatar_emoji, activities: new Set(), memorized: false };
  }
  // Update from myProgress
  for (const p of myProgress) {
    if (p.activity_id) memberMap[me.id].activities.add(p.activity_id);
    else memberMap[me.id].memorized = true;
  }

  const members = Object.entries(memberMap);
  if (members.length === 0) {
    board.innerHTML = '<p style="text-align:center;color:var(--ink-soft);font-size:14px">No progress yet. Be the first!</p>';
    return;
  }

  board.innerHTML = members.map(([id, m]) => {
    const dots = activities.map(a =>
      `<div class="progress-dot ${m.activities.has(a.id) ? 'done' : ''}"></div>`
    ).join('');
    const star = m.memorized ? '<div class="progress-star">⭐</div>' : '';
    return `
      <div class="progress-card">
        <div class="progress-emoji">${esc(m.avatar_emoji || '🌱')}</div>
        <div class="progress-name">${esc(m.name)}</div>
        <div class="progress-dots">${dots}</div>
        ${star}
      </div>`;
  }).join('');
}

function renderActivities() {
  const list = $('#activities-list');
  const completedIds = new Set(myProgress.filter(p => p.activity_id).map(p => p.activity_id));

  list.innerHTML = activities.map(a => {
    const done = completedIds.has(a.id);
    const isCurrent = a.week === currentWeek;
    const isLocked = a.week > currentWeek && !done;
    const cardClass = done ? 'completed' : isCurrent ? 'current' : isLocked ? 'locked' : '';
    const weekIcons = ['📖', '✏️', '💡', '🎤'];

    return `
      <div class="activity-card ${cardClass}" data-activity-id="${a.id}" data-week="${a.week}" data-type="${a.type}">
        <div class="activity-week">${weekIcons[a.week - 1] || a.week}</div>
        <div class="activity-body">
          <div class="activity-title">Week ${a.week}: ${esc(a.title)}</div>
          <div class="activity-desc">${esc(a.description)}</div>
        </div>
        <div class="activity-action">
          ${done
            ? '<div class="activity-check done">✓</div>'
            : isLocked
              ? '<div class="activity-check" style="opacity:0.3">🔒</div>'
              : `<button class="activity-check play-btn" data-act-id="${a.id}" data-act-type="${a.type}">▶</button>`
          }
        </div>
      </div>`;
  }).join('');

  // Wire play buttons
  list.querySelectorAll('.play-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const actId = parseInt(btn.dataset.actId);
      const actType = btn.dataset.actType;
      openGame(actId, actType);
    });
  });
}

function openGame(activityId, type) {
  const area = $('#game-area');
  area.classList.remove('hidden');

  const words = verse.text.split(/\s+/);

  if (type === 'read') {
    area.innerHTML = `
      <div class="game-title">📖 Read It</div>
      <p style="text-align:center;color:var(--ink-soft);margin-bottom:16px">Read this verse out loud. Say it three times to yourself.</p>
      <div class="verse-text-card" style="margin-bottom:20px">
        <p class="verse-text">"${esc(verse.text)}"</p>
        <p style="text-align:right;margin-top:8px;font-size:13px;font-weight:600;color:var(--primary)">${esc(verse.reference)}</p>
      </div>
      <div class="game-actions">
        <button class="btn-primary complete-btn" data-act-id="${activityId}">I read it! ✓</button>
      </div>`;
  } else if (type === 'fill-blanks') {
    // Remove ~40% of words randomly
    const blanked = words.map((w, i) => {
      if (Math.random() < 0.4 && i > 0) return { word: w, blank: true };
      return { word: w, blank: false };
    });
    area.innerHTML = `
      <div class="game-title">✏️ Fill in the Blanks</div>
      <p style="text-align:center;color:var(--ink-soft);margin-bottom:16px">Tap each blank to reveal the word.</p>
      <div class="game-words">
        ${blanked.map(w => w.blank
          ? `<span class="game-blank" data-answer="${esc(w.word)}">&nbsp;</span>`
          : `<span class="game-word">${esc(w.word)}</span>`
        ).join(' ')}
      </div>
      <div class="game-actions">
        <button class="btn-ghost" id="reveal-all-btn">Show all</button>
        <button class="btn-primary complete-btn" data-act-id="${activityId}">Done! ✓</button>
      </div>`;
    area.querySelectorAll('.game-blank').forEach(el => {
      el.addEventListener('click', () => {
        el.textContent = el.dataset.answer;
        el.classList.add('revealed');
      });
    });
    const revealBtn = area.querySelector('#reveal-all-btn');
    if (revealBtn) revealBtn.addEventListener('click', () => {
      area.querySelectorAll('.game-blank').forEach(el => {
        el.textContent = el.dataset.answer;
        el.classList.add('revealed');
      });
    });
  } else if (type === 'first-letters') {
    area.innerHTML = `
      <div class="game-title">💡 First Letter Hints</div>
      <p style="text-align:center;color:var(--ink-soft);margin-bottom:16px">Only first letters shown. Can you say the rest?</p>
      <div class="game-words">
        ${words.map(w => {
          const clean = w.replace(/[^a-zA-Z]/g, '');
          const punct = w.replace(/[a-zA-Z]/g, '');
          return `<span class="game-hint" title="${esc(w)}">${clean.charAt(0).toUpperCase()}___${punct}</span>`;
        }).join(' ')}
      </div>
      <div class="game-actions" style="margin-top:20px">
        <button class="btn-ghost" id="show-verse-btn">Show full verse</button>
        <button class="btn-primary complete-btn" data-act-id="${activityId}">I got it! ✓</button>
      </div>`;
    const showBtn = area.querySelector('#show-verse-btn');
    if (showBtn) showBtn.addEventListener('click', () => {
      area.querySelector('.game-words').innerHTML = words.map(w => `<span class="game-word">${esc(w)}</span>`).join(' ');
    });
  } else if (type === 'recite') {
    area.innerHTML = `
      <div class="game-title">🎤 Say It From Memory</div>
      <p style="text-align:center;color:var(--ink-soft);margin-bottom:16px">No peeking! Try to say the whole verse. When you've got it, record yourself below.</p>
      <div style="text-align:center;font-size:48px;padding:20px">🧠</div>
      <div class="game-actions">
        <button class="btn-primary complete-btn" data-act-id="${activityId}">I can say it! ✓</button>
      </div>`;
  }

  // Wire complete button
  area.querySelectorAll('.complete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Saving...';
      await fetch('/api/verses', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verse_id: verse.id, activity_id: parseInt(btn.dataset.actId) })
      });
      area.classList.add('hidden');
      await loadVerse();
    });
  });

  // Scroll to game
  area.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// =========================================================
// PRACTICE GAMES
// =========================================================

function getVerseWords() {
  return verse.text.split(/\s+/).filter(w => w.length > 0);
}

function showGameArea(html) {
  const area = $('#game-area');
  area.innerHTML = html;
  area.classList.remove('hidden');
  area.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function closeGame() {
  $('#game-area').classList.add('hidden');
}

// --- WORD SCRAMBLE ---
function openScrambleGame() {
  const words = getVerseWords();
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  let placed = [];

  showGameArea(`
    <div class="game-title">🔀 Word Scramble</div>
    <p style="text-align:center;color:var(--ink-soft);margin-bottom:16px">Tap the words in the correct order to rebuild the verse.</p>
    <div id="scramble-answer" class="scramble-answer"><span style="color:var(--ink-soft);font-size:13px">Tap words below to place them here...</span></div>
    <div id="scramble-pool" class="scramble-pool"></div>
    <div class="game-actions">
      <button class="btn-ghost" id="scramble-reset">Reset</button>
      <button class="btn-ghost" id="scramble-close">Close</button>
    </div>
  `);

  const pool = $('#scramble-pool');
  const answer = $('#scramble-answer');

  function renderPool() {
    pool.innerHTML = shuffled.map((w, i) =>
      placed.includes(i) ? '' : `<button class="scramble-word" data-idx="${i}">${esc(w)}</button>`
    ).join('');
    pool.querySelectorAll('.scramble-word').forEach(btn => {
      btn.addEventListener('click', () => tapWord(parseInt(btn.dataset.idx)));
    });
  }

  function renderAnswer() {
    if (placed.length === 0) {
      answer.innerHTML = '<span style="color:var(--ink-soft);font-size:13px">Tap words below to place them here...</span>';
      return;
    }
    answer.innerHTML = placed.map((idx, pos) => {
      const correct = shuffled[idx] === words[pos];
      return `<span class="scramble-word ${correct ? 'placed' : 'wrong'}">${esc(shuffled[idx])}</span>`;
    }).join('');
    // Allow removing from answer by tapping
    answer.querySelectorAll('.scramble-word').forEach((el, pos) => {
      el.addEventListener('click', () => {
        placed.splice(pos, 1);
        renderPool();
        renderAnswer();
      });
    });
  }

  function tapWord(idx) {
    placed.push(idx);
    renderPool();
    renderAnswer();
    // Check win
    if (placed.length === words.length) {
      const allCorrect = placed.every((idx, pos) => shuffled[idx] === words[pos]);
      if (allCorrect) {
        answer.innerHTML += '<div class="speed-result" style="width:100%;margin-top:12px">🎉 Perfect!</div>';
      }
    }
  }

  renderPool();
  renderAnswer();

  $('#scramble-reset').addEventListener('click', () => {
    placed = [];
    shuffled.sort(() => Math.random() - 0.5);
    renderPool();
    renderAnswer();
  });
  $('#scramble-close').addEventListener('click', closeGame);
}

// --- ERASE THE BOARD ---
function openEraseGame() {
  const words = getVerseWords();

  showGameArea(`
    <div class="game-title">🧹 Erase the Board</div>
    <p style="text-align:center;color:var(--ink-soft);margin-bottom:16px">Tap words to erase them. Try to say the verse with the gaps!</p>
    <div id="erase-board" class="erase-board"></div>
    <div class="game-actions">
      <button class="btn-ghost" id="erase-reset">Reset</button>
      <button class="btn-primary" id="erase-all">Erase all</button>
      <button class="btn-ghost" id="erase-close">Close</button>
    </div>
  `);

  const board = $('#erase-board');
  const erased = new Set();

  function renderBoard() {
    board.innerHTML = words.map((w, i) =>
      `<button class="erase-word ${erased.has(i) ? 'erased' : ''}" data-idx="${i}">${esc(w)}</button>`
    ).join('');
    board.querySelectorAll('.erase-word:not(.erased)').forEach(btn => {
      btn.addEventListener('click', () => {
        erased.add(parseInt(btn.dataset.idx));
        renderBoard();
        if (erased.size === words.length) {
          board.innerHTML = '<div style="color:#e8e0d0;text-align:center;padding:20px;font-size:18px;font-style:italic">The board is empty. Can you say the whole verse? 🧠</div>';
        }
      });
    });
  }

  renderBoard();

  $('#erase-all').addEventListener('click', () => {
    words.forEach((_, i) => erased.add(i));
    renderBoard();
    board.innerHTML = '<div style="color:#e8e0d0;text-align:center;padding:20px;font-size:18px;font-style:italic">The board is empty. Can you say the whole verse? 🧠</div>';
  });
  $('#erase-reset').addEventListener('click', () => { erased.clear(); renderBoard(); });
  $('#erase-close').addEventListener('click', closeGame);
}

// --- SPEED ROUND ---
function openSpeedGame() {
  const words = getVerseWords();
  const shuffled = [...words].sort(() => Math.random() - 0.5);
  let nextIdx = 0;
  let startTime = null;
  let timerInterval = null;

  showGameArea(`
    <div class="game-title">⚡ Speed Round</div>
    <p style="text-align:center;color:var(--ink-soft);margin-bottom:16px">Tap the words in the correct order as fast as you can!</p>
    <div id="speed-timer" class="speed-timer">0.0s</div>
    <div id="speed-pool" class="speed-pool"></div>
    <div id="speed-result"></div>
    <div class="game-actions">
      <button class="btn-ghost" id="speed-restart">Restart</button>
      <button class="btn-ghost" id="speed-close">Close</button>
    </div>
  `);

  const pool = $('#speed-pool');
  const timerEl = $('#speed-timer');
  const resultEl = $('#speed-result');

  function renderPool() {
    pool.innerHTML = shuffled.map((w, i) =>
      `<button class="speed-word" data-orig-idx="${words.indexOf(w)}" data-shuf-idx="${i}">${esc(w)}</button>`
    ).join('');

    // Need to handle duplicate words properly
    const wordPositions = {};
    words.forEach((w, i) => {
      if (!wordPositions[w]) wordPositions[w] = [];
      wordPositions[w].push(i);
    });

    pool.querySelectorAll('.speed-word').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!startTime) {
          startTime = performance.now();
          timerInterval = setInterval(() => {
            timerEl.textContent = ((performance.now() - startTime) / 1000).toFixed(1) + 's';
          }, 100);
        }

        const clickedWord = shuffled[parseInt(btn.dataset.shufIdx)];
        if (clickedWord === words[nextIdx]) {
          btn.classList.add('correct');
          nextIdx++;
          if (nextIdx === words.length) {
            clearInterval(timerInterval);
            const time = ((performance.now() - startTime) / 1000).toFixed(1);
            timerEl.textContent = time + 's';
            resultEl.innerHTML = `<div class="speed-result">🎉 Done in ${time} seconds!</div>`;
          }
        } else {
          btn.classList.add('wrong');
          setTimeout(() => btn.classList.remove('wrong'), 300);
        }
      });
    });
  }

  renderPool();

  $('#speed-restart').addEventListener('click', () => {
    nextIdx = 0;
    startTime = null;
    clearInterval(timerInterval);
    timerEl.textContent = '0.0s';
    resultEl.innerHTML = '';
    shuffled.sort(() => Math.random() - 0.5);
    renderPool();
  });
  $('#speed-close').addEventListener('click', () => { clearInterval(timerInterval); closeGame(); });
}

// --- TYPE IT OUT ---
function openTypeItGame() {
  showGameArea(`
    <div class="game-title">⌨️ Type It Out</div>
    <p style="text-align:center;color:var(--ink-soft);margin-bottom:16px">Type the verse from memory. No peeking!</p>
    <textarea id="typeit-input" class="typeit-input" placeholder="Start typing the verse..." rows="4"></textarea>
    <div id="typeit-feedback" class="typeit-feedback" style="display:none"></div>
    <div class="game-actions" style="margin-top:16px">
      <button class="btn-primary" id="typeit-check">Check it</button>
      <button class="btn-ghost" id="typeit-close">Close</button>
    </div>
  `);

  const input = $('#typeit-input');
  const feedback = $('#typeit-feedback');
  input.focus();

  $('#typeit-check').addEventListener('click', () => {
    const typed = input.value.trim();
    if (!typed) return;

    const targetWords = verse.text.toLowerCase().replace(/[^\w\s']/g, '').split(/\s+/);
    const typedWords = typed.toLowerCase().replace(/[^\w\s']/g, '').split(/\s+/);

    let correct = 0;
    const maxLen = Math.max(targetWords.length, typedWords.length);
    const highlighted = [];

    for (let i = 0; i < maxLen; i++) {
      const tw = targetWords[i] || '';
      const uw = typedWords[i] || '';
      if (tw === uw) {
        correct++;
        highlighted.push(`<span class="typeit-match">${esc(verse.text.split(/\s+/)[i] || tw)}</span>`);
      } else if (uw) {
        highlighted.push(`<span class="typeit-miss">${esc(uw)}</span>`);
      } else {
        highlighted.push(`<span class="typeit-miss">___</span>`);
      }
    }

    const pct = Math.round((correct / targetWords.length) * 100);
    const isPerfect = pct === 100;

    feedback.style.display = '';
    feedback.className = 'typeit-feedback ' + (isPerfect ? 'perfect' : 'close');
    feedback.innerHTML = isPerfect
      ? '🎉 Perfect! You got every word right!'
      : `<strong>${pct}% correct</strong> (${correct}/${targetWords.length} words)<br><br>${highlighted.join(' ')}`;
  });

  $('#typeit-close').addEventListener('click', closeGame);
}

function renderRecordings() {
  const list = $('#recordings-list');
  if (recordings.length === 0) {
    list.innerHTML = '<p style="text-align:center;color:var(--ink-soft);font-size:14px;padding:20px">No recordings yet. Be the first to show you memorized it!</p>';
    return;
  }

  list.innerHTML = recordings.map(r => {
    const media = r.media_type === 'video'
      ? `<video class="recording-media" src="${esc(r.media_url)}" controls playsinline></video>`
      : `<audio class="recording-media" controls><source src="${esc(r.media_url)}"></audio>`;
    return `
      <div class="recording-card">
        <div class="recording-header">
          <span class="recording-emoji">${esc(r.avatar_emoji || '🌱')}</span>
          <span class="recording-name">${esc(r.name)}</span>
          <span class="recording-time">${timeAgo(r.created_at)}</span>
        </div>
        ${media}
      </div>`;
  }).join('');
}

// Recording / upload
async function handleMediaFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  await uploadAndSave(file, file.type.startsWith('video') ? 'video' : 'audio');
}

async function startAudioRecording() {
  if (isRecording) {
    audioRecorder.stop();
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
    audioRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    audioRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    audioRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      isRecording = false;
      $('#record-audio-btn').textContent = '🎙️ Record audio';
      $('#record-audio-btn').style.background = 'var(--emerald)';
      const actualMime = audioRecorder.mimeType || mimeType || 'audio/mp4';
      const blob = new Blob(audioChunks, { type: actualMime });
      const file = new File([blob], `verse-recording.${ext}`, { type: actualMime });
      uploadAndSave(file, 'audio');
    };
    audioRecorder.start();
    isRecording = true;
    $('#record-audio-btn').textContent = '⏹ Tap to stop';
    $('#record-audio-btn').style.background = 'rgba(239,68,68,0.8)';
  } catch (e) {
    alert('Microphone access needed.');
  }
}

async function uploadAndSave(file, type) {
  const statusEl = $('#upload-status');
  statusEl.textContent = 'Uploading...';
  statusEl.className = 'upload-status uploading';
  statusEl.classList.remove('hidden');

  try {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/media/upload', { method: 'POST', body: formData });
    const data = await res.json();

    if (!res.ok) {
      statusEl.textContent = data.error || 'Upload failed.';
      statusEl.className = 'upload-status error';
      return;
    }

    // Save recording
    await fetch('/api/verses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verse_id: verse.id, recording_url: data.url, recording_type: type })
    });

    // Also mark as memorized
    await fetch('/api/verses', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ verse_id: verse.id })
    });

    statusEl.textContent = '✓ Recording saved!';
    statusEl.className = 'upload-status done';
    setTimeout(() => statusEl.classList.add('hidden'), 2000);
    loadVerse();
  } catch (e) {
    statusEl.textContent = 'Upload failed. Try again.';
    statusEl.className = 'upload-status error';
  }
}

// Set verse (admin)
function openVerseModal() {
  $('#modal-verse').classList.remove('hidden');
  if (verse) {
    $('#verse-ref-input').value = verse.reference;
    $('#verse-text-input').value = verse.text;
  }
  setTimeout(() => $('#verse-ref-input').focus(), 100);
}

async function submitVerse(e) {
  e.preventDefault();
  const reference = $('#verse-ref-input').value.trim();
  const text = $('#verse-text-input').value.trim();
  if (!reference || !text) return;

  const btn = e.target.querySelector('button[type=submit]');
  btn.disabled = true;
  btn.textContent = 'Setting...';

  try {
    const res = await fetch('/api/verses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reference, text })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      $('#verse-error').textContent = data.error || 'Could not set verse.';
      $('#verse-error').classList.remove('hidden');
      return;
    }
    $('#modal-verse').classList.add('hidden');
    $('#verse-form').reset();
    loadVerse();
  } finally {
    btn.disabled = false;
    btn.textContent = 'Set verse';
  }
}

// Archive
async function loadArchive() {
  const list = $('#archive-list');
  if (!list.classList.contains('hidden')) {
    list.classList.add('hidden');
    $('#show-archive-btn').textContent = 'View past verses';
    return;
  }

  try {
    const res = await fetch('/api/verses?all=1');
    if (!res.ok) return;
    const data = await res.json();
    const verses = (data.verses || []).filter(v => v.id !== (verse ? verse.id : null));

    if (verses.length === 0) {
      list.innerHTML = '<p style="text-align:center;color:var(--ink-soft);padding:20px">No past verses yet.</p>';
    } else {
      list.innerHTML = verses.map(v => {
        const [y, m] = v.month.split('-');
        const label = new Date(y, m - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return `
          <div class="archive-card">
            <div class="archive-ref">${esc(v.reference)}</div>
            <div class="archive-text">"${esc(v.text)}"</div>
            <div class="archive-month">${label}</div>
          </div>`;
      }).join('');
    }
    list.classList.remove('hidden');
    $('#show-archive-btn').textContent = 'Hide past verses';
  } catch (e) { console.error(e); }
}

// Helpers
function esc(s) {
  return String(s || '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
}

function timeAgo(unix) {
  const seconds = Math.floor(Date.now() / 1000) - unix;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(unix * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
