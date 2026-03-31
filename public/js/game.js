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
const playerName   = sessionStorage.getItem('playerName')   || 'Player';
const walletAddress = sessionStorage.getItem('walletAddress') || null;
const playerEmail  = sessionStorage.getItem('playerEmail')  || null;

let myId = null;
let isDead = false;
let mousePos = { x: 0, y: 0 };
let boostActive = false;

// --- Interpolation buffers ---
// We keep the last two snapshots and lerp between them each frame
let snapBuffer = [];          // [{t, state}, {t, state}]
let renderTime = 0;           // the world-time we're currently rendering
const INTERP_DELAY_MS = 50;   // render this many ms behind latest snapshot (buffer window)

// Displayed (interpolated) state used for rendering
let displayState = { snakes: [], food: [], worldRadius: CONSTANTS.BASE_WORLD_RADIUS, leaderboard: [] };

// Socket
const socket = io();

socket.on('connect', () => {
  socket.emit(CONSTANTS.EVENTS.PLAY, { name: playerName, walletAddress, email: playerEmail });
});

socket.on(CONSTANTS.EVENTS.GAME_JOINED, ({ playerId, worldRadius, snakeColor, food }) => {
  myId = playerId;
  isDead = false;
  snapBuffer = [];
  displayState.worldRadius = worldRadius;
  displayState.food = food || [];
  document.getElementById('death-screen').classList.remove('active');
});

socket.on(CONSTANTS.EVENTS.SNAPSHOT, (snap) => {
  snapBuffer.push({ t: snap.t, state: snap });
  // Keep only the last 6 snapshots (enough for ~100ms of buffer at 60Hz)
  if (snapBuffer.length > 6) snapBuffer.shift();
  updateHUD(snap);
});

socket.on(CONSTANTS.EVENTS.PLAYER_DIED, ({ score, length }) => {
  isDead = true;
  document.getElementById('death-screen').classList.add('active');
  document.getElementById('death-length').textContent = length;
  document.getElementById('death-score').textContent = score;
});

// --- Interpolation ---
function interpolateState(now) {
  if (snapBuffer.length === 0) return;

  // Target render time = latest snapshot time minus delay
  renderTime = now - INTERP_DELAY_MS;

  // Find the two snapshots that bracket renderTime
  let before = null, after = null;
  for (let i = 0; i < snapBuffer.length - 1; i++) {
    if (snapBuffer[i].t <= renderTime && snapBuffer[i + 1].t >= renderTime) {
      before = snapBuffer[i];
      after  = snapBuffer[i + 1];
      break;
    }
  }

  // If we can't bracket, just use the latest snapshot directly
  if (!before || !after) {
    const latest = snapBuffer[snapBuffer.length - 1];
    displayState = latest.state;
    return;
  }

  const alpha = (renderTime - before.t) / (after.t - before.t);

  // Interpolate world radius
  displayState.worldRadius = lerp(before.state.worldRadius, after.state.worldRadius, alpha);
  displayState.leaderboard = after.state.leaderboard;
  displayState.food = after.state.food; // food doesn't need interpolation

  // Interpolate each snake
  const interpolatedSnakes = [];
  for (const snakeAfter of after.state.snakes) {
    const snakeBefore = before.state.snakes.find(s => s.id === snakeAfter.id);
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

// Death screen
document.getElementById('btn-respawn').addEventListener('click', () => {
  isDead = false;
  socket.emit(CONSTANTS.EVENTS.RESPAWN);
  document.getElementById('death-screen').classList.remove('active');
});
document.getElementById('btn-lobby').addEventListener('click', () => {
  window.location.href = '/';
});

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
    document.getElementById('hud-length').textContent = mySnake.length;
    document.getElementById('hud-score').textContent = mySnake.score;
    const pct = Math.round((mySnake.boostRatio || 0) * 100);
    const fill = document.getElementById('boost-bar-fill');
    if (fill) fill.style.width = pct + '%';
  }
  const lb = snap.leaderboard || [];
  const lbEl = document.getElementById('leaderboard-list');
  if (lbEl) {
    lbEl.innerHTML = lb.map(p =>
      `<li class="${p.id === myId ? 'me' : ''}">
        <span class="lb-rank">#${p.rank}</span>
        <span>${escHtml(p.name)}</span>
        <span class="lb-score">${p.score}</span>
      </li>`
    ).join('') || '<li style="color:#555">—</li>';
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Main render loop — runs at monitor refresh rate (60/144/240Hz)
function gameLoop(now) {
  interpolateState(now);
  renderer.render(displayState, myId, mousePos);
  if (minimapCtx) renderer.drawMinimap(minimapCtx, displayState, myId);
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
