// Game client
const canvas = document.getElementById('game-canvas');
const renderer = new Renderer(canvas);

// Minimap
const minimapCanvas = document.createElement('canvas');
minimapCanvas.width = 140;
minimapCanvas.height = 140;
const minimapEl = document.getElementById('minimap');
if (minimapEl) minimapEl.appendChild(minimapCanvas);
const minimapCtx = minimapCanvas.getContext('2d');

// Player info from lobby
const playerName    = sessionStorage.getItem('playerName')    || 'Player';
const walletAddress = sessionStorage.getItem('walletAddress') || null;
const googleId      = sessionStorage.getItem('googleId')      || null;
const lobbyType     = sessionStorage.getItem('lobbyType')     || 'free';

let myId = null;
let isDead = false;
let mousePos = { x: 0, y: 0 };
let boostActive = false;

// --- Interpolation buffers ---
let snapBuffer   = [];    // [{t, state}]  — t is server Date.now() ms
let clockOffset  = null;  // server Date.now() minus client performance.now(), set on first snap
const INTERP_DELAY_MS = 100; // stay 100ms behind server so we always have 2 snaps to bracket

// Displayed (interpolated) state used for rendering
let displayState = { snakes: [], food: [], worldRadius: CONSTANTS.BASE_WORLD_RADIUS, leaderboard: [] };

// Socket
const socket = io();

const snakeColor = sessionStorage.getItem('snakeColor') || localStorage.getItem('hexslither_skin_color') || '#E8756A';

socket.on('connect', () => {
  socket.emit(CONSTANTS.EVENTS.PLAY, { name: playerName, walletAddress, googleId, color: snakeColor, lobbyType });
});

socket.on(CONSTANTS.EVENTS.GAME_JOINED, ({ playerId, worldRadius, snakeColor, food }) => {
  myId = playerId;
  isDead = false;
  snapBuffer = [];
  clockOffset = null;
  displayState = { snakes: [], food: food || [], worldRadius, leaderboard: [] };
  document.getElementById('death-screen').classList.remove('active');
});

socket.on(CONSTANTS.EVENTS.SNAPSHOT, (snap) => {
  // Establish clock offset on first snapshot so we can compare server Date.now()
  // against client performance.now() (they are different timescales)
  if (clockOffset === null) clockOffset = snap.t - performance.now();
  snapBuffer.push({ t: snap.t, state: snap });
  if (snapBuffer.length > 8) snapBuffer.shift();
  updateHUD(snap);
  updateLeaderboard(snap);
});

socket.on(CONSTANTS.EVENTS.PLAYER_DIED, ({ score, length }) => {
  isDead = true;
  document.getElementById('death-screen').classList.add('active');
  document.getElementById('death-length').textContent = length;
  document.getElementById('death-score').textContent = score;
});

// --- Interpolation ---
function interpolateState(now) {
  if (snapBuffer.length === 0 || clockOffset === null) return;

  // Convert client performance.now() to server time so we can compare against snap.t
  const serverNow = now + clockOffset;
  const renderTime = serverNow - INTERP_DELAY_MS;

  // Find the two snapshots that bracket renderTime
  let before = null, after = null;
  for (let i = 0; i < snapBuffer.length - 1; i++) {
    if (snapBuffer[i].t <= renderTime && snapBuffer[i + 1].t >= renderTime) {
      before = snapBuffer[i];
      after  = snapBuffer[i + 1];
      break;
    }
  }

  // If we can't bracket (buffer too small or renderTime is ahead), use latest snapshot
  if (!before || !after) {
    const latest = snapBuffer[snapBuffer.length - 1];
    displayState = { ...latest.state };
    return;
  }

  const alpha = Math.max(0, Math.min(1, (renderTime - before.t) / (after.t - before.t)));

  // Interpolate world radius
  displayState.worldRadius = lerp(before.state.worldRadius, after.state.worldRadius, alpha);
  displayState.leaderboard = after.state.leaderboard;
  displayState.food = after.state.food; // food doesn't need interpolation

  // Interpolate each snake — O(1) Map lookup instead of O(n) find
  const beforeMap = new Map(before.state.snakes.map(s => [s.id, s]));
  const interpolatedSnakes = [];
  for (const snakeAfter of after.state.snakes) {
    const snakeBefore = beforeMap.get(snakeAfter.id);
    if (!snakeBefore) {
      interpolatedSnakes.push(snakeAfter);
      continue;
    }
    // Interpolate each segment pair
    const segs = [];
    const len = Math.min(snakeBefore.segs.length, snakeAfter.segs.length);
    for (let i = 0; i < len; i++) {
      segs.push(lerp(snakeBefore.segs[i], snakeAfter.segs[i], alpha));
    }
    interpolatedSnakes.push({
      ...snakeAfter,
      segs,
      angle: lerpAngle(snakeBefore.angle, snakeAfter.angle, alpha),
    });
  }
  displayState.snakes = interpolatedSnakes;
}

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI)  diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

// --- Input ---
canvas.addEventListener('mousemove', (e) => {
  mousePos.x = e.clientX;
  mousePos.y = e.clientY;
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', (e) => { if (e.button === 2) boostActive = true; });
canvas.addEventListener('mouseup',   (e) => { if (e.button === 2) boostActive = false; });
window.addEventListener('keydown', (e) => { if (e.code === 'Space') { e.preventDefault(); boostActive = true; } });
window.addEventListener('keyup',   (e) => { if (e.code === 'Space') boostActive = false; });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  mousePos.x = t.clientX;
  mousePos.y = t.clientY;
}, { passive: false });
canvas.addEventListener('touchstart', (e) => { if (e.touches.length > 1) boostActive = true; });
canvas.addEventListener('touchend',   (e) => { if (e.touches.length === 0) boostActive = false; });

// ─── Spectate ─────────────────────────────────────────────────────────────────
let spectating   = false;
let spectateIndex = 0;

function getSpectateTargets() {
  return displayState.snakes.filter(s => s.id !== myId);
}

function enterSpectate() {
  spectating = true;
  spectateIndex = 0;
  document.getElementById('death-screen').classList.remove('active');
  document.getElementById('spectate-bar').classList.add('active');
  updateSpectateLabel();
}

function exitSpectate() {
  spectating = false;
  document.getElementById('spectate-bar').classList.remove('active');
}

function updateSpectateLabel() {
  const targets = getSpectateTargets();
  const label = document.getElementById('spectate-label');
  if (targets.length === 0) {
    label.textContent = 'No players to spectate';
  } else {
    const t = targets[spectateIndex % targets.length];
    label.textContent = 'Spectating: ' + (t.name || 'Player');
  }
}

document.getElementById('btn-spectate').addEventListener('click', enterSpectate);

document.getElementById('spectate-prev').addEventListener('click', () => {
  const n = getSpectateTargets().length;
  if (n === 0) return;
  spectateIndex = (spectateIndex - 1 + n) % n;
  updateSpectateLabel();
});

document.getElementById('spectate-next').addEventListener('click', () => {
  const n = getSpectateTargets().length;
  if (n === 0) return;
  spectateIndex = (spectateIndex + 1) % n;
  updateSpectateLabel();
});

document.getElementById('spectate-stop').addEventListener('click', () => {
  window.location.href = '/';
});

// Death screen
document.getElementById('btn-respawn').addEventListener('click', () => {
  isDead = false;
  spectating = false;
  exitSpectate();
  socket.emit(CONSTANTS.EVENTS.RESPAWN);
  document.getElementById('death-screen').classList.remove('active');
});
document.getElementById('btn-lobby').addEventListener('click', () => {
  window.location.href = '/';
});

// ─── All-Time Leaderboard Modal ───────────────────────────────────────────────
(function() {
  const modal   = document.getElementById('modal-alltime');
  const listEl  = document.getElementById('alltime-list');
  const openBtn = document.getElementById('btn-alltime-lb');
  const closeBtn = document.getElementById('modal-alltime-close');

  function escHtmlLocal(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  openBtn.addEventListener('click', () => {
    modal.classList.remove('hidden');
    listEl.innerHTML = '<li style="color:#555">Loading…</li>';
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => {
        if (!data.length) {
          listEl.innerHTML = '<li style="color:#555">No scores recorded yet</li>';
          return;
        }
        listEl.innerHTML = data.map(p =>
          `<li><span class="al-rank">#${p.rank}</span>` +
          `<span class="al-name">${escHtmlLocal(p.name)}</span>` +
          `<span class="al-score">${p.score}</span></li>`
        ).join('');
      })
      .catch(() => { listEl.innerHTML = '<li style="color:#c33">Failed to load</li>'; });
  });

  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
})();

// Resize
function resize() { renderer.resize(); }
resize();
window.addEventListener('resize', resize);

// Send input at 60Hz (matches server tick rate)
function sendInput() {
  if (!myId || isDead) return;
  const mySnake = displayState.snakes.find(s => s.id === myId);
  if (!mySnake) return;
  const worldPos = renderer.camera.screenToWorld(mousePos.x, mousePos.y, canvas.width, canvas.height);
  const angle = Math.atan2(worldPos.y - mySnake.segs[1], worldPos.x - mySnake.segs[0]);
  socket.emit(CONSTANTS.EVENTS.INPUT, { angle, boost: boostActive });
}
setInterval(sendInput, 1000 / 60);

// HUD (updated on each snapshot, not each frame)
function updateHUD(snap) {
  const mySnake = snap.snakes.find(s => s.id === myId);
  if (mySnake) {
    const lengthEl = document.getElementById('hud-length');
    const scoreEl  = document.getElementById('hud-score');
    if (lengthEl) lengthEl.textContent = mySnake.length;
    if (scoreEl)  scoreEl.textContent  = mySnake.score;
    const pct  = Math.round((mySnake.boostRatio || 0) * 100);
    const fill = document.getElementById('boost-bar-fill');
    if (fill) fill.style.width = pct + '%';
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Leaderboard — updated from snapshot (60Hz max), not render loop
let _lastLbHtml = '';
function updateLeaderboard(snap) {
  const aliveIds = new Set(snap.snakes.map(s => s.id));
  const lb = (snap.leaderboard || []).filter(p => aliveIds.has(p.id));
  const html = lb.map(p =>
    `<li class="${p.id === myId ? 'me' : ''}">` +
    `<span class="lb-rank">#${p.rank}</span>` +
    `<span>${escHtml(p.name)}</span>` +
    `<span class="lb-score">${p.score}</span></li>`
  ).join('') || '<li style="color:#555">—</li>';
  if (html !== _lastLbHtml) {
    const lbEl = document.getElementById('leaderboard-list');
    if (lbEl) lbEl.innerHTML = html;
    _lastLbHtml = html;
  }
}

// FPS counter
let fpsFrames = 0, fpsLast = performance.now(), fpsDisplay = 0;
const fpsEl = document.getElementById('fps-counter');

// Main render loop — runs at monitor refresh rate (60/144/240Hz)
function gameLoop(now) {
  interpolateState(now);
  let spectateSnake = null;
  if (spectating) {
    const targets = getSpectateTargets();
    if (targets.length > 0) spectateSnake = targets[spectateIndex % targets.length];
  }
  renderer.render(displayState, myId, mousePos, spectateSnake);

  if (minimapCtx) renderer.drawMinimap(minimapCtx, displayState, myId);

  // FPS
  fpsFrames++;
  if (now - fpsLast >= 500) {
    fpsDisplay = Math.round(fpsFrames * 1000 / (now - fpsLast));
    fpsFrames = 0;
    fpsLast = now;
    if (fpsEl) fpsEl.textContent = `FPS: ${fpsDisplay}`;
  }

  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);

// ─── Admin console (press ` to toggle) ───────────────────────────────────────
(function() {
  const consoleEl  = document.getElementById('admin-console');
  const inputEl    = document.getElementById('admin-input');
  const feedbackEl = document.getElementById('admin-feedback');

  function openConsole() {
    consoleEl.classList.add('open');
    inputEl.value = '';
    feedbackEl.textContent = '';
    inputEl.focus();
  }
  function closeConsole() { consoleEl.classList.remove('open'); }

  window.addEventListener('keydown', (e) => {
    if (e.key === '`' || e.key === '~') {
      e.preventDefault();
      consoleEl.classList.contains('open') ? closeConsole() : openConsole();
      return;
    }
    if (e.key === 'Escape' && consoleEl.classList.contains('open')) closeConsole();
  });

  inputEl.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key !== 'Enter') return;
    const raw = inputEl.value.trim().toLowerCase();
    if (!raw) { closeConsole(); return; }

    const parts = raw.split(/\s+/);
    const cmd   = parts[0];

    if (cmd === 'bot' || cmd === 'bots') {
      const count = parseInt(parts[1]) || 1;
      socket.emit('admin:spawnbot', { count });
      feedbackEl.textContent = `Requesting ${count} bot(s)...`;
    } else {
      feedbackEl.textContent = 'Commands: bot [n]';
    }
    inputEl.value = '';
  });

  socket.on('admin:ack', ({ message }) => {
    feedbackEl.textContent = '✓ ' + message;
    setTimeout(closeConsole, 1800);
  });
})();
