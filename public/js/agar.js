'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────
const WORLD_W       = 6000;
const WORLD_H       = 6000;
const FOOD_COUNT    = 1200;
const FOOD_RADIUS   = 8;
const FOOD_MASS     = 1;
const MIN_SPLIT_MASS = 36;   // minimum mass to be able to split
const MAX_CELLS     = 16;
const SPLIT_SPEED   = 600;   // initial velocity of a split piece (world units/sec)
const MERGE_DELAY   = 12000; // ms before two pieces can merge
const GRID_SIZE     = 60;
const CAM_LERP      = 0.1;
const SCALE_LERP    = 0.07;

const FOOD_COLORS = [
  '#f87171','#fb923c','#fbbf24','#4ade80',
  '#34d399','#60a5fa','#a78bfa','#f472b6',
  '#2dd4bf','#e879f9','#f97316','#84cc16',
];

// ─── State ────────────────────────────────────────────────────────────────────
let canvas, ctx;
let playerName  = 'Player';
let playerColor = '#6366f1';
let cells       = [];
let foods       = [];
let screenMX    = 0, screenMY = 0;
let mouseWX     = WORLD_W / 2, mouseWY = WORLD_H / 2;
let camX        = WORLD_W / 2, camY = WORLD_H / 2;
let camScale    = 1;
let tgtCamX     = camX, tgtCamY = camY, tgtScale = 1;
let lastTime    = 0;
let animId      = null;
let running     = false;
let finalScore  = 0;

// ─── Init ─────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('game-canvas');
  ctx    = canvas.getContext('2d');

  playerName  = sessionStorage.getItem('playerName')  || 'Player';
  playerColor = localStorage.getItem('duelseries_skin_color') || '#6366f1';

  resize();
  window.addEventListener('resize', resize);

  spawnPlayer();
  spawnFood();

  canvas.addEventListener('mousemove', onMouseMove);
  window.addEventListener('keydown', onKeyDown);

  canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    const t = e.touches[0];
    handleMousePos(t.clientX, t.clientY);
  }, { passive: false });

  document.getElementById('btn-back').addEventListener('click', () => {
    stop();
    window.location.href = '/';
  });
  document.getElementById('btn-respawn').addEventListener('click', () => {
    document.getElementById('death-screen').classList.add('hidden');
    spawnPlayer();
    running = true;
    lastTime = performance.now();
    if (!animId) animId = requestAnimationFrame(loop);
  });
  document.getElementById('btn-death-lobby').addEventListener('click', () => {
    stop();
    window.location.href = '/';
  });

  running = true;
  lastTime = performance.now();
  animId = requestAnimationFrame(loop);
});

function resize() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}

function stop() {
  running = false;
  if (animId) { cancelAnimationFrame(animId); animId = null; }
}

// ─── Spawn ────────────────────────────────────────────────────────────────────
function spawnPlayer() {
  const x = WORLD_W * 0.2 + Math.random() * WORLD_W * 0.6;
  const y = WORLD_H * 0.2 + Math.random() * WORLD_H * 0.6;
  cells = [makeCell(x, y, 20, 0, 0)];
  camX = x; camY = y;
  tgtCamX = x; tgtCamY = y;
  tgtScale = calcScale(20);
  camScale = tgtScale;
}

function makeCell(x, y, mass, vx, vy) {
  return { x, y, mass, vx, vy, mergeTimer: 0 };
}

function spawnFood() {
  foods = [];
  for (let i = 0; i < FOOD_COUNT; i++) foods.push(randomFood());
}

function randomFood() {
  return {
    x:     Math.random() * WORLD_W,
    y:     Math.random() * WORLD_H,
    color: FOOD_COLORS[Math.floor(Math.random() * FOOD_COLORS.length)],
  };
}

// ─── Input ────────────────────────────────────────────────────────────────────
function onMouseMove(e) { handleMousePos(e.clientX, e.clientY); }

function handleMousePos(cx, cy) {
  screenMX = cx; screenMY = cy;
  updateMouseWorld();
}

function updateMouseWorld() {
  mouseWX = (screenMX - canvas.width  / 2) / camScale + camX;
  mouseWY = (screenMY - canvas.height / 2) / camScale + camY;
}

function onKeyDown(e) {
  if (e.code === 'Space') { e.preventDefault(); splitCells(); }
}

// ─── Split ────────────────────────────────────────────────────────────────────
function splitCells() {
  if (cells.length >= MAX_CELLS) return;
  const toAdd = [];
  for (const cell of cells) {
    if (cells.length + toAdd.length >= MAX_CELLS) break;
    if (cell.mass < MIN_SPLIT_MASS) continue;

    const dx = mouseWX - cell.x;
    const dy = mouseWY - cell.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = dx / len, ny = dy / len;

    const half = cell.mass / 2;
    cell.mass = half;
    cell.mergeTimer = MERGE_DELAY;

    const r = radius(half);
    toAdd.push(makeCell(
      cell.x + nx * r * 1.1,
      cell.y + ny * r * 1.1,
      half,
      nx * SPLIT_SPEED,
      ny * SPLIT_SPEED,
    ));
    toAdd[toAdd.length - 1].mergeTimer = MERGE_DELAY;
  }
  cells.push(...toAdd);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function radius(mass) { return Math.sqrt(mass) * 10; }

function calcScale(totalMass) {
  return Math.max(0.15, Math.min(1.5, Math.sqrt(20) / Math.sqrt(totalMass) * 1.2));
}

// ─── Update ───────────────────────────────────────────────────────────────────
function update(dt) {
  // Move each cell toward mouse
  for (const cell of cells) {
    const dx = mouseWX - cell.x;
    const dy = mouseWY - cell.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const r = radius(cell.mass);

    // Decelerate split velocity exponentially (decays to ~15% after 1 second)
    cell.vx *= Math.pow(0.15, dt);
    cell.vy *= Math.pow(0.15, dt);

    // Speed inversely proportional to sqrt(mass) — bigger = slower
    const speed = 550 / Math.sqrt(cell.mass); // world units per second

    if (dist > r * 0.5) {
      const nx = dx / dist, ny = dy / dist;
      cell.x += (nx * speed + cell.vx) * dt;
      cell.y += (ny * speed + cell.vy) * dt;
    } else {
      cell.x += cell.vx * dt;
      cell.y += cell.vy * dt;
    }

    // Clamp to world
    const r2 = radius(cell.mass);
    cell.x = Math.max(r2, Math.min(WORLD_W - r2, cell.x));
    cell.y = Math.max(r2, Math.min(WORLD_H - r2, cell.y));

    if (cell.mergeTimer > 0) cell.mergeTimer -= dt * 1000;
  }

  // Separate overlapping own cells (physical push)
  separateCells(dt);

  // Merge cells that are ready
  mergeCells();

  // Eat food
  eatFood();

  // Camera target = weighted center of mass
  const com = centerOfMass();
  tgtCamX = com.x;
  tgtCamY = com.y;

  const totalMass = cells.reduce((s, c) => s + c.mass, 0);
  tgtScale = calcScale(totalMass);

  camX     += (tgtCamX  - camX)     * CAM_LERP;
  camY     += (tgtCamY  - camY)     * CAM_LERP;
  camScale += (tgtScale - camScale) * SCALE_LERP;

  // Update mouse world position after camera move
  updateMouseWorld();

  // HUD
  const score = Math.floor(totalMass);
  finalScore  = score;
  document.getElementById('score-val').textContent = score;
  document.getElementById('cells-val').textContent = cells.length;
}

function centerOfMass() {
  if (!cells.length) return { x: WORLD_W / 2, y: WORLD_H / 2 };
  let tw = 0, cx = 0, cy = 0;
  for (const c of cells) { cx += c.x * c.mass; cy += c.y * c.mass; tw += c.mass; }
  return { x: cx / tw, y: cy / tw };
}

function eatFood() {
  for (let i = foods.length - 1; i >= 0; i--) {
    const f = foods[i];
    for (const cell of cells) {
      const r = radius(cell.mass);
      const dx = cell.x - f.x, dy = cell.y - f.y;
      if (dx * dx + dy * dy < (r - FOOD_RADIUS * 0.4) ** 2) {
        cell.mass += FOOD_MASS;
        foods[i] = randomFood(); // respawn in place
        break;
      }
    }
  }
}

function separateCells(dt) {
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const minDist = radius(a.mass) + radius(b.mass);
      if (dist < minDist) {
        // Push apart
        const overlap = (minDist - dist) / 2;
        const nx = dx / dist, ny = dy / dist;
        const push = overlap * 0.3;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }
}

function mergeCells() {
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const a = cells[i], b = cells[j];
      if (a.mergeTimer > 0 || b.mergeTimer > 0) continue;
      const dx = a.x - b.x, dy = a.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const overlap = Math.max(radius(a.mass), radius(b.mass));
      if (dist < overlap * 0.6) {
        const tm = a.mass + b.mass;
        a.x = (a.x * a.mass + b.x * b.mass) / tm;
        a.y = (a.y * a.mass + b.y * b.mass) / tm;
        a.vx = (a.vx * a.mass + b.vx * b.mass) / tm;
        a.vy = (a.vy * a.mass + b.vy * b.mass) / tm;
        a.mass = tm;
        cells.splice(j, 1);
        j--;
      }
    }
  }
}

// ─── Render ───────────────────────────────────────────────────────────────────
function render() {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Outside-border background (slightly darker)
  ctx.fillStyle = '#dde3f5';
  ctx.fillRect(0, 0, W, H);

  ctx.save();
  ctx.translate(W / 2 - camX * camScale, H / 2 - camY * camScale);
  ctx.scale(camScale, camScale);

  // Inside-border fill (lighter than outer background)
  ctx.fillStyle = '#f0f4ff';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  // Grid covers full viewport including outside border
  drawGrid();

  drawBorder();

  // Food
  for (const f of foods) {
    ctx.beginPath();
    ctx.arc(f.x, f.y, FOOD_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = f.color;
    ctx.fill();
  }

  // Sort cells: smaller drawn on top of larger
  const sorted = [...cells].sort((a, b) => b.mass - a.mass);
  for (const cell of sorted) drawCell(cell);

  ctx.restore();
}

function drawGrid() {
  // Cover full visible viewport (including outside world border)
  const ox     = W2C(0),            oy     = H2C(0);
  const right  = W2C(canvas.width), bottom = H2C(canvas.height);

  const x0 = Math.floor(ox     / GRID_SIZE) * GRID_SIZE;
  const y0 = Math.floor(oy     / GRID_SIZE) * GRID_SIZE;
  const x1 = Math.ceil (right  / GRID_SIZE) * GRID_SIZE;
  const y1 = Math.ceil (bottom / GRID_SIZE) * GRID_SIZE;

  ctx.strokeStyle = 'rgba(99,102,241,0.13)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += GRID_SIZE) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = y0; y <= y1; y += GRID_SIZE) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
}

function W2C(sx) { return (sx - canvas.width  / 2) / camScale + camX; }
function H2C(sy) { return (sy - canvas.height / 2) / camScale + camY; }

function drawBorder() {
  ctx.strokeStyle = 'rgba(99,102,241,0.45)';
  ctx.lineWidth = 8;
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

  // Soft inner glow
  const gr = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  gr.addColorStop(0,   'rgba(99,102,241,0.05)');
  gr.addColorStop(1,   'rgba(99,102,241,0.05)');
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

function drawCell(cell) {
  const r = radius(cell.mass);

  ctx.save();
  ctx.shadowColor  = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur   = r * 0.35;
  ctx.shadowOffsetY = r * 0.06;

  ctx.beginPath();
  ctx.arc(cell.x, cell.y, r, 0, Math.PI * 2);
  ctx.fillStyle = playerColor;
  ctx.fill();
  ctx.restore();

  // Border
  ctx.beginPath();
  ctx.arc(cell.x, cell.y, r, 0, Math.PI * 2);
  ctx.strokeStyle = darken(playerColor, 0.22);
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.stroke();

  // Glint
  const gx = cell.x - r * 0.28, gy = cell.y - r * 0.28;
  const gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.72);
  gl.addColorStop(0,   'rgba(255,255,255,0.48)');
  gl.addColorStop(0.55,'rgba(255,255,255,0.12)');
  gl.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.beginPath();
  ctx.arc(cell.x, cell.y, r, 0, Math.PI * 2);
  ctx.fillStyle = gl;
  ctx.fill();

  // Name label (when large enough)
  if (r > 18) {
    const fontSize = Math.max(10, Math.min(r * 0.36, 28));
    ctx.font         = `700 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle    = 'rgba(255,255,255,0.92)';
    ctx.fillText(playerName, cell.x, cell.y);
  }
}

function darken(hex, amt) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, ((n >> 16) & 0xff) - Math.round(255 * amt));
  const g = Math.max(0, ((n >>  8) & 0xff) - Math.round(255 * amt));
  const b = Math.max(0, ( n        & 0xff) - Math.round(255 * amt));
  return `rgb(${r},${g},${b})`;
}

// ─── Loop ─────────────────────────────────────────────────────────────────────
function loop(now) {
  if (!running) return;
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  render();
  animId = requestAnimationFrame(loop);
}
