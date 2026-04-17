'use strict';

// ─── Constants (must match AgarRoom.js) ──────────────────────────────────────
const MIN_SPLIT_MASS = 36;
const MAX_CELLS      = 16;
const SPLIT_SPEED    = 650;
const MERGE_DELAY    = 12000;
const SPEED_BASE     = 1000;
const FOOD_RADIUS    = 8;
const FOOD_MASS      = 1;
const GRID_SIZE      = 60;
const CAM_LERP       = 0.12;
const SCALE_LERP     = 0.08;

// ─── State ────────────────────────────────────────────────────────────────────
let canvas, ctx, socket;
let myId        = null;
let myName      = 'Player';
let myColor     = '#6366f1';
let players     = new Map();   // id → { id, name, color, cells, alive, score }
let foods       = new Map();   // id → { id, x, y, color }
let worldSize   = 6000;
let camX        = 3000, camY = 3000, camScale = 1;
let tgtCamX     = 3000, tgtCamY = 3000, tgtScale = 1;
let screenMX    = 0, screenMY = 0;
let mouseWX     = 3000, mouseWY = 3000;
let animId      = null;
let lastTime    = 0;
let dead        = false;
let finalScore  = 0;

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  canvas  = document.getElementById('game-canvas');
  ctx     = canvas.getContext('2d');
  myName  = sessionStorage.getItem('playerName')  || 'Player';
  myColor = localStorage.getItem('duelseries_skin_color') || '#6366f1';

  resize();
  window.addEventListener('resize', resize);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    onMouseMove({ clientX: t.clientX, clientY: t.clientY });
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.code === 'Space') { e.preventDefault(); socket && socket.emit('cell:split'); }
  });

  document.getElementById('btn-back').addEventListener('click', () => {
    socket && socket.disconnect();
    window.location.href = '/';
  });
  document.getElementById('btn-respawn').addEventListener('click', () => {
    dead = false;
    document.getElementById('death-screen').classList.add('hidden');
    socket && socket.emit('cell:respawn');
  });
  document.getElementById('btn-death-lobby').addEventListener('click', () => {
    socket && socket.disconnect();
    window.location.href = '/';
  });

  connectSocket();
});

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

// ─── Socket ───────────────────────────────────────────────────────────────────
function connectSocket() {
  socket = io();

  socket.on('connect', () => {
    const lobbyType = sessionStorage.getItem('lobbyType') || 'free';
    socket.emit('cell:join', { name: myName, color: myColor, lobbyType });
  });

  socket.on('cell:joined', ({ playerId, worldSize: ws, foods: initFoods, players: initPlayers }) => {
    myId      = playerId;
    worldSize = ws;

    foods.clear();
    for (const f of initFoods) foods.set(f.id, f);

    players.clear();
    for (const p of initPlayers) players.set(p.id, p);

    const me = players.get(myId);
    if (me && me.cells.length) {
      camX = me.cells[0].x; camY = me.cells[0].y;
      tgtCamX = camX; tgtCamY = camY;
      const tm = me.cells.reduce((s, c) => s + c.mass, 0);
      camScale = calcScale(tm); tgtScale = camScale;
    }

    if (!animId) { lastTime = performance.now(); animId = requestAnimationFrame(loop); }
  });

  socket.on('cell:state', ({ players: updates, removedFoods, addedFoods }) => {
    for (const p of updates) players.set(p.id, p);
    for (const fid of removedFoods) foods.delete(fid);
    for (const f of addedFoods)    foods.set(f.id, f);

    const me = players.get(myId);
    if (me) {
      if (me.alive && me.cells.length) {
        const com = centerOfMass(me.cells);
        tgtCamX = com.x; tgtCamY = com.y;
        tgtScale = calcScale(me.cells.reduce((s, c) => s + c.mass, 0));
      }
      document.getElementById('score-val').textContent = me.score || 0;
      document.getElementById('cells-val').textContent = me.cells.length;
    }
  });

  socket.on('cell:died', ({ killedBy, score }) => {
    dead = true; finalScore = score || 0;
    document.getElementById('death-score-val').textContent = finalScore;
    document.getElementById('death-screen').classList.remove('hidden');
  });

  socket.on('cell:playerJoined', ({ id, name, color, cells }) => {
    players.set(id, { id, name, color, cells, alive: true, score: 0 });
  });

  socket.on('cell:playerLeft', ({ id }) => { players.delete(id); });

  socket.on('cell:worldSize', ({ size }) => { worldSize = size; });

  socket.on('disconnect', () => { console.log('[agar] disconnected'); });
}

// ─── Input ────────────────────────────────────────────────────────────────────
function onMouseMove(e) {
  screenMX = e.clientX; screenMY = e.clientY;
  mouseWX = (screenMX - canvas.width  / 2) / camScale + camX;
  mouseWY = (screenMY - canvas.height / 2) / camScale + camY;
  socket && socket.volatile.emit('cell:input', { mouseX: mouseWX, mouseY: mouseWY });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function calcScale(totalMass) {
  return Math.max(0.12, Math.min(1.5, Math.sqrt(20) / Math.sqrt(totalMass) * 1.2));
}

function centerOfMass(cells) {
  let tw = 0, cx = 0, cy = 0;
  for (const c of cells) { cx += c.x * c.mass; cy += c.y * c.mass; tw += c.mass; }
  return tw ? { x: cx / tw, y: cy / tw } : { x: worldSize / 2, y: worldSize / 2 };
}

function radius(mass) { return Math.sqrt(mass) * 10; }

// ─── Loop ─────────────────────────────────────────────────────────────────────
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  camX     += (tgtCamX  - camX)     * CAM_LERP;
  camY     += (tgtCamY  - camY)     * CAM_LERP;
  camScale += (tgtScale - camScale) * SCALE_LERP;

  // Keep mouse world position updated as camera drifts
  mouseWX = (screenMX - canvas.width  / 2) / camScale + camX;
  mouseWY = (screenMY - canvas.height / 2) / camScale + camY;

  render();
  animId = requestAnimationFrame(loop);
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Outside-border background
  ctx.fillStyle = '#dde3f5';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2 - camX * camScale, H / 2 - camY * camScale);
  ctx.scale(camScale, camScale);

  // Inside-border fill
  ctx.fillStyle = '#f0f4ff';
  ctx.fillRect(0, 0, worldSize, worldSize);

  drawGrid();
  drawBorder();

  // Food
  for (const f of foods.values()) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, FOOD_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = f.color;
    ctx.fill();
  }

  // Other players first (underneath)
  for (const [id, p] of players) {
    if (id === myId || !p.alive) continue;
    const sorted = [...p.cells].sort((a, b) => b.mass - a.mass);
    for (const cell of sorted) drawCell(cell, p.color, p.name);
  }

  // My player on top
  const me = players.get(myId);
  if (me && me.alive) {
    const sorted = [...me.cells].sort((a, b) => b.mass - a.mass);
    for (const cell of sorted) drawCell(cell, myColor, myName);
  }

  ctx.restore();
}

function drawGrid() {
  const left   = (0        - canvas.width  / 2) / camScale + camX;
  const top    = (0        - canvas.height / 2) / camScale + camY;
  const right  = (canvas.width  - canvas.width  / 2) / camScale + camX;
  const bottom = (canvas.height - canvas.height / 2) / camScale + camY;

  const x0 = Math.floor(left   / GRID_SIZE) * GRID_SIZE;
  const y0 = Math.floor(top    / GRID_SIZE) * GRID_SIZE;
  const x1 = Math.ceil (right  / GRID_SIZE) * GRID_SIZE;
  const y1 = Math.ceil (bottom / GRID_SIZE) * GRID_SIZE;

  ctx.strokeStyle = 'rgba(99,102,241,0.13)';
  ctx.lineWidth   = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += GRID_SIZE) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += GRID_SIZE) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
}

function drawBorder() {
  ctx.strokeStyle = 'rgba(99,102,241,0.5)';
  ctx.lineWidth   = 8;
  ctx.strokeRect(0, 0, worldSize, worldSize);
}

function drawCell(cell, color, name) {
  const r = radius(cell.mass);

  ctx.save();
  ctx.shadowColor   = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur    = r * 0.3;
  ctx.shadowOffsetY = r * 0.05;
  ctx.beginPath();
  ctx.arc(cell.x, cell.y, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();

  ctx.beginPath();
  ctx.arc(cell.x, cell.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = darken(color, 0.22);
  ctx.lineWidth   = Math.max(2, r * 0.06);
  ctx.stroke();

  // Glint
  const gx = cell.x - r * 0.28, gy = cell.y - r * 0.28;
  const gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.72);
  gl.addColorStop(0,    'rgba(255,255,255,0.48)');
  gl.addColorStop(0.55, 'rgba(255,255,255,0.1)');
  gl.addColorStop(1,    'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cell.x, cell.y, r, 0, Math.PI * 2);
  ctx.fillStyle = gl;
  ctx.fill();

  if (r > 18) {
    const fs = Math.max(10, Math.min(r * 0.36, 28));
    ctx.font         = `700 ${fs}px Inter, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(255,255,255,0.92)';
    ctx.fillText(name, cell.x, cell.y);
  }
}

function darken(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(255 * amt));
  const g = Math.max(0, ((n >>  8) & 0xff) - Math.round(255 * amt));
  const b = Math.max(0, ( n        & 0xff) - Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}
