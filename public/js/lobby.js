// ─── Hex background ───────────────────────────────────────────────────────────
(function() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');

  function hexPath(cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i + Math.PI / 6;
      ctx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
    }
    ctx.closePath();
  }

  function draw() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#070707';
    ctx.fillRect(0, 0, W, H);

    const size = 48;
    const gap = 14.6;
    const colStep = Math.sqrt(3) * size + gap;
    const rowStep = 1.5 * size + Math.sqrt(3) / 2 * gap;
    const faceR = size - gap / 2;

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(-0.285);
    ctx.scale(1.45, 1.45);
    ctx.translate(-W / 2, -H / 2);

    for (let row = -4; row < H / rowStep + 5; row++) {
      for (let col = -4; col < W / colStep + 5; col++) {
        const cx = col * colStep + (row % 2 === 1 ? colStep / 2 : 0);
        const cy = row * rowStep;

        hexPath(cx, cy, faceR);
        const face = ctx.createLinearGradient(
          cx + size * 0.65, cy - size * 0.65,
          cx - size * 0.65, cy + size * 0.65
        );
        face.addColorStop(0,    '#181818');
        face.addColorStop(0.25, '#101010');
        face.addColorStop(0.6,  '#0b0b0b');
        face.addColorStop(1,    '#050505');
        ctx.fillStyle = face;
        ctx.fill();

        hexPath(cx, cy, faceR);
        const rim = ctx.createLinearGradient(
          cx + size * 0.55, cy - size * 0.55,
          cx - size * 0.55, cy + size * 0.55
        );
        rim.addColorStop(0,    'rgba(45,45,45,0.15)');
        rim.addColorStop(0.45, 'rgba(0,0,0,0)');
        rim.addColorStop(1,    'rgba(0,0,0,0.55)');
        ctx.strokeStyle = rim;
        ctx.lineWidth = size * 0.055;
        ctx.stroke();

        hexPath(cx, cy, faceR);
        ctx.strokeStyle = 'rgba(1,1,1,0.95)';
        ctx.lineWidth = 5;
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  draw();
  window.addEventListener('resize', draw);
})();

// ─── Agar.io lobby background ─────────────────────────────────────────────────
(function() {
  const canvas = document.getElementById('bg-canvas-2');
  const ctx    = canvas.getContext('2d');

  const PLAYER_DATA = [
    { r: 118, color: '#33CC33', name: '~haii~'    },
    { r:  98, color: '#00CCFF', name: 'JiriK'     },
    { r:  84, color: '#FF2244', name: 'chomper'   },
    { r:  70, color: '#FF6600', name: 'nomnom'    },
    { r:  58, color: '#CC33FF', name: ''          },
    { r:  48, color: '#FFCC00', name: 'destroyer' },
    { r:  40, color: '#FF33CC', name: ''          },
    { r:  34, color: '#00EE88', name: 'hungry'    },
    { r:  28, color: '#0055FF', name: ''          },
    { r:  22, color: '#FF4488', name: ''          },
    { r:  18, color: '#AA44FF', name: ''          },
    { r:  15, color: '#33CC33', name: ''          },
  ];
  const FOOD_COLORS = [
    '#FF2244','#FF6600','#FFCC00','#33CC33','#00CCFF',
    '#0055FF','#CC33FF','#FF33CC','#00EE88','#FF4488',
    '#FF3300','#66EE00','#00AAFF','#FFAA00',
  ];

  function darken(hex) {
    const n = parseInt(hex.slice(1), 16);
    return `rgb(${Math.max(0,(n>>16)-60)},${Math.max(0,((n>>8)&0xff)-60)},${Math.max(0,(n&0xff)-60)})`;
  }

  const cells = [];

  function placeCell(r, W, H) {
    for (let attempt = 0; attempt < 150; attempt++) {
      const x = r + 20 + Math.random() * (W - r * 2 - 40);
      const y = r + 20 + Math.random() * (H - r * 2 - 40);
      let ok = true;
      for (const c of cells) {
        const dx = c.x - x, dy = c.y - y;
        if (Math.sqrt(dx*dx + dy*dy) < c.r + r + 12) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return null;
  }

  function makeCells() {
    cells.length = 0;
    const W = canvas.width, H = canvas.height;

    // Player cells — defined sizes and colors
    for (const pd of PLAYER_DATA) {
      const pos = placeCell(pd.r, W, H);
      if (!pos) continue;
      const spd = 0.55 / Math.pow(pd.r / 25, 0.55); // bigger = slower
      cells.push({
        x: pos.x, y: pos.y,
        vx: (Math.random() - 0.5) * spd * 2,
        vy: (Math.random() - 0.5) * spd * 2,
        r: pd.r, color: pd.color, name: pd.name,
        baseSpeed: spd, isFood: false,
        fleeTimer: 0, chaseTarget: null,
      });
    }

    // Food pellets
    for (let i = 0; i < 55; i++) {
      const r = 5 + Math.random() * 7;
      const pos = placeCell(r, W, H);
      if (!pos) continue;
      cells.push({
        x: pos.x, y: pos.y,
        vx: (Math.random() - 0.5) * 0.08,
        vy: (Math.random() - 0.5) * 0.08,
        r, color: FOOD_COLORS[i % FOOD_COLORS.length],
        name: '', baseSpeed: 0.08, isFood: true,
        fleeTimer: 0, chaseTarget: null,
      });
    }
  }

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    makeCells();
  }

  function drawGrid() {
    const W = canvas.width, H = canvas.height;
    const STEP = 50;
    ctx.save();
    ctx.strokeStyle = 'rgba(100,140,210,0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= W; x += STEP) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = 0; y <= H; y += STEP) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    ctx.restore();
  }

  function drawCell(cell) {
    const { x, y, r, color, name } = cell;

    // Drop shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.20)';
    ctx.shadowBlur  = r * 0.5;
    ctx.shadowOffsetY = r * 0.08;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();

    // Darker border ring
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = darken(color);
    ctx.lineWidth   = Math.max(2, r * 0.07);
    ctx.stroke();

    // Radial highlight (upper-left glint → transparent)
    const glintX = x - r * 0.30, glintY = y - r * 0.30;
    const glint  = ctx.createRadialGradient(glintX, glintY, 0, glintX, glintY, r * 0.75);
    glint.addColorStop(0,   'rgba(255,255,255,0.45)');
    glint.addColorStop(0.5, 'rgba(255,255,255,0.10)');
    glint.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = glint;
    ctx.fill();

    // Name
    if (name && r >= 40) {
      const fs = Math.round(Math.min(r * 0.36, 26));
      ctx.font         = `bold ${fs}px Segoe UI, sans-serif`;
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle    = 'rgba(0,0,0,0.30)';
      ctx.fillText(name, x + 1, y + 1);
      ctx.fillStyle    = '#ffffff';
      ctx.fillText(name, x, y);
    }
  }

  // ── AI: separation, flee, and chase ──────────────────────────────────────
  function applyAI() {
    const players = cells.filter(c => !c.isFood);

    // 1. Separation — push overlapping cells apart
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i], b = cells[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const minD = a.r + b.r + 6;
        if (dist < minD) {
          const push = (minD - dist) / 2;
          const nx = dx / dist, ny = dy / dist;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          // Deflect velocities slightly
          a.vx -= nx * 0.04; a.vy -= ny * 0.04;
          b.vx += nx * 0.04; b.vy += ny * 0.04;
        }
      }
    }

    // 2. Chase/flee — large cells pursue a small neighbour; small cells flee
    for (const big of players) {
      if (big.r < 55) continue;
      // Pick a chase target occasionally
      if (!big.chaseTarget || big.chaseTimer <= 0) {
        // Find a small player cell within 350px
        let best = null, bestD = 350;
        for (const small of players) {
          if (small === big || small.r > big.r * 0.6) continue;
          const d = Math.hypot(big.x - small.x, big.y - small.y);
          if (d < bestD) { bestD = d; best = small; }
        }
        big.chaseTarget = best;
        big.chaseTimer  = 180 + Math.floor(Math.random() * 240); // 3-7 sec at 60fps
      }
      if (big.chaseTimer > 0) big.chaseTimer--;

      const prey = big.chaseTarget;
      if (prey) {
        // Big cell steers toward prey (gently)
        const dx = prey.x - big.x, dy = prey.y - big.y;
        const d  = Math.hypot(dx, dy) || 1;
        big.vx += (dx / d) * 0.012;
        big.vy += (dy / d) * 0.012;
        const spd = Math.hypot(big.vx, big.vy);
        if (spd > big.baseSpeed) { big.vx *= big.baseSpeed / spd; big.vy *= big.baseSpeed / spd; }

        // Prey flees if predator is within 280px
        if (d < 280) {
          prey.vx -= (dx / d) * 0.025;
          prey.vy -= (dy / d) * 0.025;
          const ps = Math.hypot(prey.vx, prey.vy);
          const preyMax = prey.baseSpeed * 1.6;
          if (ps > preyMax) { prey.vx *= preyMax / ps; prey.vy *= preyMax / ps; }
        }
      }
    }
  }

  let rafId = null;

  function tick(t) {
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#eef2f7';
    ctx.fillRect(0, 0, W, H);
    drawGrid();

    applyAI();

    // Sort so large cells render on top of small ones
    cells.sort((a, b) => a.r - b.r);

    for (const cell of cells) {
      // Move
      cell.x += cell.vx;
      cell.y += cell.vy;

      // Dampen (slow drift if no force applied)
      cell.vx *= 0.992;
      cell.vy *= 0.992;

      // Bounce off edges
      if (cell.x - cell.r < 0)  { cell.x = cell.r;     cell.vx = Math.abs(cell.vx); }
      if (cell.x + cell.r > W)  { cell.x = W - cell.r; cell.vx = -Math.abs(cell.vx); }
      if (cell.y - cell.r < 0)  { cell.y = cell.r;     cell.vy = Math.abs(cell.vy); }
      if (cell.y + cell.r > H)  { cell.y = H - cell.r; cell.vy = -Math.abs(cell.vy); }

      drawCell(cell);
    }

    rafId = requestAnimationFrame(tick);
  }

  window.addEventListener('resize', resize);
  resize();

  window._agarBg = {
    start() { if (!rafId) rafId = requestAnimationFrame(tick); },
    stop()  { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } },
  };
})();

// ─── App ──────────────────────────────────────────────────────────────────────
const socket = io();
let account = null;
let walletAddress = null;

// Check if logged in via Google session
fetch('/auth/me')
  .then(r => r.json())
  .then(({ loggedIn, account: acc }) => {
    if (loggedIn && acc) {
      account = acc;
      showLobby();
    } else {
      document.getElementById('login-screen').classList.remove('hidden');
    }
  })
  .catch(() => {
    document.getElementById('login-screen').classList.remove('hidden');
  });

// Check for auth error param
if (new URLSearchParams(location.search).get('error') === 'auth') {
  alert('Google sign-in failed. Please try again.');
}

// ─── Socket ───────────────────────────────────────────────────────────────────
socket.on(CONSTANTS.EVENTS.LOBBY_STATE, ({ playerCount, lobbyCount, leaderboard }) => {
  const ig = document.getElementById('stat-players-ingame');
  const il = document.getElementById('stat-players-inlobby');
  const b  = document.getElementById('stat-players-login');
  if (ig) ig.textContent = playerCount;
  if (il) il.textContent = lobbyCount ?? 0;
  if (b)  b.textContent  = (playerCount || 0) + (lobbyCount || 0);
  updateLobbyLeaderboard(leaderboard);
});

socket.on(CONSTANTS.EVENTS.WALLET_BALANCE, ({ balance }) => {
  setBalance(balance);
});

socket.on(CONSTANTS.EVENTS.ERROR, ({ message }) => alert('Error: ' + message));

// ─── Lobby navigation ─────────────────────────────────────────────────────────
let currentLobby = 1;
const lobbies = [
  document.getElementById('lobby-screen'),
  document.getElementById('lobby-screen-2'),
];
const arrowLeft  = document.getElementById('lobby-arrow-left');
const arrowRight = document.getElementById('lobby-arrow-right');

function showArrows() {
  arrowLeft.classList.add('visible');
  arrowRight.classList.add('visible');
}
function hideArrows() {
  arrowLeft.classList.remove('visible');
  arrowRight.classList.remove('visible');
}

const bgCanvas1   = document.getElementById('bg-canvas');
const bgCanvas2   = document.getElementById('bg-canvas-2');
const snakeCanvas = document.getElementById('snake-canvas');

function switchLobby(direction) {
  const total     = lobbies.length;
  const nextIndex = ((currentLobby - 1 + direction + total) % total);
  const current   = lobbies[currentLobby - 1];
  const next      = lobbies[nextIndex];

  const outClass = direction === 1 ? 'slide-out-left'  : 'slide-out-right';
  const inClass  = direction === 1 ? 'slide-in-right'  : 'slide-in-left';
  const goingToArena = nextIndex === 1;

  hideArrows();

  // Start agar animation before fade so it's ready
  if (goingToArena) window._agarBg.start();

  // Crossfade backgrounds simultaneously with the content slide
  if (goingToArena) {
    bgCanvas2.style.opacity = '1';
    bgCanvas1.style.opacity = '0';
    snakeCanvas.style.opacity = '0';
  } else {
    bgCanvas1.style.opacity = '1';
    snakeCanvas.style.opacity = '1';
    bgCanvas2.style.opacity = '0';
  }

  // Slide content
  current.classList.add(outClass);
  setTimeout(() => {
    current.classList.add('hidden');
    current.classList.remove(outClass);
    next.classList.remove('hidden');
    next.classList.add(inClass);

    // Stop agar after fade-out completes when leaving arena
    if (!goingToArena) setTimeout(() => window._agarBg.stop(), 650);

    setTimeout(() => {
      next.classList.remove(inClass);
      // Tint arrows for light vs dark background
      document.querySelectorAll('.lobby-nav-arrow').forEach(a => {
        a.dataset.theme = goingToArena ? 'light' : 'dark';
      });
      showArrows();
    }, 340);
  }, 320);

  currentLobby = nextIndex + 1;
}

arrowRight.addEventListener('click', () => switchLobby(1));
arrowLeft.addEventListener('click',  () => switchLobby(-1));

// ─── Lobby UI ─────────────────────────────────────────────────────────────────
function showLobby() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('lobby-screen').classList.remove('hidden');
  showArrows();

  // Avatar
  const img = document.getElementById('account-avatar-img');
  const fallback = document.getElementById('account-avatar-fallback');
  if (account.avatar) {
    img.src = account.avatar;
    img.classList.remove('hidden');
    fallback.classList.add('hidden');
  } else {
    img.classList.add('hidden');
    fallback.textContent = (account.name || '?')[0].toUpperCase();
    fallback.classList.remove('hidden');
  }

  document.getElementById('account-name').textContent   = account.name || 'Player';
  document.getElementById('account-email').textContent  = account.email || '';
  document.getElementById('stat-highscore').textContent = account.highScore  || 0;
  document.getElementById('stat-games').textContent     = account.gamesPlayed || 0;
  const savedName = account.name || localStorage.getItem('duelseries_playername') || '';
  document.getElementById('player-name').value          = savedName;
  document.getElementById('play-username').textContent  = savedName;
  document.getElementById('topbar-name').textContent    = account.name || 'Player';

  // Topbar avatar
  const tav = document.getElementById('topbar-avatar');
  if (account.avatar) { tav.src = account.avatar; }
  document.getElementById('topbar-user').classList.remove('hidden');
  document.getElementById('topbar-login-btn').classList.add('hidden');
  document.getElementById('topbar-username').textContent = account.name || 'Player';

  // Play card avatar
  const pai = document.getElementById('play-avatar-img');
  const paf = document.getElementById('play-avatar-fallback');
  if (account.avatar) { pai.src = account.avatar; pai.classList.remove('hidden'); paf.classList.add('hidden'); }
  else { paf.textContent = (account.name || '?')[0].toUpperCase(); }

  // Populate lobby 2 account fields with same data
  document.getElementById('account-name-2').textContent  = account.name || 'Player';
  document.getElementById('account-email-2').textContent = account.email || '';
  const img2 = document.getElementById('account-avatar-img-2');
  const fb2  = document.getElementById('account-avatar-fallback-2');
  if (account.avatar) {
    img2.src = account.avatar; img2.classList.remove('hidden'); fb2.classList.add('hidden');
  } else {
    fb2.textContent = (account.name || '?')[0].toUpperCase();
  }
  const pai2 = document.getElementById('play-avatar-img-2');
  const paf2 = document.getElementById('play-avatar-fallback-2');
  if (account.avatar) { pai2.src = account.avatar; pai2.classList.remove('hidden'); paf2.classList.add('hidden'); }
  else { paf2.textContent = (account.name || '?')[0].toUpperCase(); }
  const savedName2 = account.name || localStorage.getItem('duelseries_playername') || '';
  document.getElementById('player-name-2').value         = savedName2;
  document.getElementById('play-username-2').textContent = savedName2;

  socket.emit('lobby:join', { googleId: account.googleId });
}

// Edit name
document.getElementById('btn-edit-name').addEventListener('click', () => {
  document.getElementById('editname-input').value = account.name || '';
  document.getElementById('modal-editname').classList.add('active');
});
document.getElementById('cancel-editname').addEventListener('click', () => {
  document.getElementById('modal-editname').classList.remove('active');
});
document.getElementById('confirm-editname').addEventListener('click', async () => {
  const name = document.getElementById('editname-input').value.trim();
  if (!name) return;
  const res = await fetch('/auth/update-name', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  const { account: updated } = await res.json();
  account = updated;
  document.getElementById('account-name').textContent  = account.name;
  document.getElementById('player-name').value         = account.name;
  document.getElementById('play-username').textContent = account.name;
  document.getElementById('topbar-name').textContent   = account.name;
  document.getElementById('topbar-username').textContent = account.name;
  document.getElementById('modal-editname').classList.remove('active');
});

function updateLobbyLeaderboard(lb) {
  const el = document.getElementById('lobby-leaderboard');
  if (!el) return;
  if (!lb || lb.length === 0) {
    el.innerHTML = '<li><span class="lb-name" style="color:#555">No players yet</span></li>';
    return;
  }
  el.innerHTML = lb.map(p =>
    `<li><span class="rank">#${p.rank}</span><span class="lb-name">${escHtml(p.name)}</span><span class="lb-score">${p.score}</span></li>`
  ).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── All-Time Leaderboard Modal (lobby) ───────────────────────────────────────
(function() {
  const openBtn  = document.getElementById('btn-lobby-leaderboard');
  const modal    = document.getElementById('modal-lobby-leaderboard');
  const closeBtn = document.getElementById('close-lobby-leaderboard');
  const listEl   = document.getElementById('lobby-alltime-list');
  if (!openBtn || !modal) return;

  openBtn.addEventListener('click', () => {
    modal.style.display = 'flex';
    listEl.innerHTML = '<li style="color:#555">Loading…</li>';
    fetch('/api/leaderboard')
      .then(r => r.json())
      .then(data => {
        if (!data.length) { listEl.innerHTML = '<li style="color:#555">No scores recorded yet</li>'; return; }
        listEl.innerHTML = data.map(p =>
          `<li><span class="al-rank">#${p.rank}</span>` +
          `<span class="al-name">${escHtml(p.name)}</span>` +
          `<span class="al-score">${p.score}</span></li>`
        ).join('');
      })
      .catch(() => { listEl.innerHTML = '<li style="color:#c33">Failed to load</li>'; });
  });

  closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
})();

// ─── Wallet ───────────────────────────────────────────────────────────────────
let walletInfo = null;
let solPriceUsd = null;

fetch('/wallet/info').then(r => r.json()).then(info => {
  if (info && info.escrowAddress) walletInfo = info;
}).catch(() => {});

// Fetch SOL/CAD price once, cache it
fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=cad')
  .then(r => r.json())
  .then(d => { solPriceUsd = d?.solana?.cad || null; })
  .catch(() => {});

function setBalance(bal) {
  const sol = parseFloat(bal) || 0;
  const cadStr = solPriceUsd !== null ? 'CA$' + (sol * solPriceUsd).toFixed(2) : 'CA$—';
  const solStr = sol.toFixed(4) + ' SOL';
  // Update both lobbies
  ['game-balance', 'game-balance-2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = solStr;
  });
  ['game-balance-usd', 'game-balance-usd-2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = cadStr;
  });
  const sb = document.getElementById('sidebar-balance');
  if (sb) sb.textContent = sol.toFixed(4);
}

function walletStatus(msg, isError) {
  ['wallet-status', 'wallet-status-2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = msg; el.style.color = isError ? '#ff6666' : '#14F195'; }
  });
}

fetch('/auth/me').then(r => r.json()).then(({ account: acc }) => {
  if (acc) setBalance(acc.balance || 0);
});

document.getElementById('btn-refresh-balance').addEventListener('click', async () => {
  const btn = document.getElementById('btn-refresh-balance');
  btn.textContent = '↻ Checking...';
  btn.disabled = true;
  try {
    const res = await fetch('/wallet/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.status === 202) {
      // No new deposit — just refresh balance from account
      const meRes = await fetch('/auth/me');
      const { account: acc } = await meRes.json();
      if (acc) setBalance(acc.balance || 0);
      walletStatus('Balance up to date');
    } else {
      const data = await res.json();
      if (data.error) {
        walletStatus(data.error, true);
      } else {
        setBalance(data.balance);
        walletStatus(`Deposit received: ${data.amount.toFixed(4)} SOL ✓`);
      }
    }
  } catch (e) {
    walletStatus('Refresh failed', true);
  }
  btn.textContent = '↻ Refresh';
  btn.disabled = false;
});

// ─── Add Funds ────────────────────────────────────────────────────────────────
let depositPollTimer = null;

function stopDepositPoll() {
  if (depositPollTimer) { clearInterval(depositPollTimer); depositPollTimer = null; }
}

async function pollForDeposit() {
  const statusEl = document.getElementById('deposit-status');
  try {
    const res = await fetch('/wallet/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (res.status === 401) {
      stopDepositPoll();
      statusEl.style.color = '#ff6666';
      statusEl.textContent = 'Session expired — please refresh the page.';
      return;
    }
    if (res.status === 202) return; // no deposit yet, keep waiting
    const data = await res.json();
    if (data.error) { console.warn('[deposit poll]', data.error); return; }
    // Deposit found!
    stopDepositPoll();
    setBalance(data.balance);
    statusEl.style.color = '#14F195';
    statusEl.textContent = `Received ${data.amount.toFixed(4)} SOL ✓`;
    walletStatus(`Deposit received: ${data.amount.toFixed(4)} SOL ✓`);
    setTimeout(() => document.getElementById('modal-receive').classList.remove('active'), 2500);
  } catch (e) { /* network hiccup, keep waiting */ }
}

document.getElementById('btn-add-funds').addEventListener('click', () => {
  if (!walletInfo) { walletStatus('Wallet not configured on server.', true); return; }
  const addr = walletInfo.escrowAddress;
  document.getElementById('receive-address-short').textContent = addr.slice(0, 6) + '...' + addr.slice(-4);
  const statusEl = document.getElementById('deposit-status');
  statusEl.style.color = '#555';
  statusEl.textContent = 'Waiting for your deposit...';

  const qrEl = document.getElementById('receive-qr');
  qrEl.innerHTML = '';
  new QRCode(qrEl, {
    text: addr,
    width: 190,
    height: 190,
    colorDark: '#ffffff',
    colorLight: '#141828',
    correctLevel: QRCode.CorrectLevel.M,
  });
  document.getElementById('modal-receive').classList.add('active');

  // Poll immediately, then every 12 seconds while modal is open
  stopDepositPoll();
  pollForDeposit();
  depositPollTimer = setInterval(pollForDeposit, 12000);
});

document.getElementById('btn-check-now').addEventListener('click', () => {
  document.getElementById('deposit-status').style.color = '#aaa';
  document.getElementById('deposit-status').textContent = 'Checking...';
  pollForDeposit();
});

document.getElementById('close-receive').addEventListener('click', () => {
  stopDepositPoll();
  document.getElementById('modal-receive').classList.remove('active');
});

document.getElementById('btn-copy-address').addEventListener('click', () => {
  if (!walletInfo) return;
  navigator.clipboard.writeText(walletInfo.escrowAddress).then(() => {
    const btn = document.getElementById('btn-copy-address');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
});

// ─── Withdraw ─────────────────────────────────────────────────────────────────
document.getElementById('btn-withdraw').addEventListener('click', () =>
  document.getElementById('modal-withdraw').classList.add('active'));
document.getElementById('cancel-withdraw').addEventListener('click', () =>
  document.getElementById('modal-withdraw').classList.remove('active'));
document.getElementById('confirm-withdraw').addEventListener('click', async () => {
  const walletAddress = document.getElementById('withdraw-wallet').value.trim();
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  if (!walletAddress) { alert('Enter your Phantom wallet address.'); return; }
  if (!amount || amount <= 0) return;

  document.getElementById('modal-withdraw').classList.remove('active');
  walletStatus('Processing withdrawal...');

  try {
    const res = await fetch('/wallet/withdraw', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, walletAddress }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    setBalance(data.balance);
    walletStatus(`Withdrew ${amount.toFixed(4)} SOL ✓`);
  } catch (e) {
    walletStatus('Withdrawal failed: ' + (e.message || e), true);
  }
  document.getElementById('withdraw-amount').value = '';
  document.getElementById('withdraw-wallet').value = '';
});

// ─── Lobby 2 wallet buttons (share same modals/functions as lobby 1) ──────────
document.getElementById('btn-refresh-balance-2').addEventListener('click', async () => {
  const btn = document.getElementById('btn-refresh-balance-2');
  btn.textContent = '↻ Checking...';
  btn.disabled = true;
  try {
    const res = await fetch('/wallet/deposit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    if (res.status === 202) {
      const meRes = await fetch('/auth/me');
      const { account: acc } = await meRes.json();
      if (acc) setBalance(acc.balance || 0);
      walletStatus('Balance up to date');
    } else {
      const data = await res.json();
      if (data.error) walletStatus(data.error, true);
      else { setBalance(data.balance); walletStatus(`Deposit received: ${data.amount.toFixed(4)} SOL ✓`); }
    }
  } catch (e) { walletStatus('Refresh failed', true); }
  btn.textContent = '↻ Refresh';
  btn.disabled = false;
});

document.getElementById('btn-add-funds-2').addEventListener('click', () =>
  document.getElementById('btn-add-funds').click()
);
document.getElementById('btn-withdraw-2').addEventListener('click', () =>
  document.getElementById('modal-withdraw').classList.add('active')
);

// ─── Lobby 2 lobby type selection ─────────────────────────────────────────────
const LOBBY_LABELS_2 = { free: 'FREE PLAY', dime: '▶ 10¢ LOBBY', dollar: '▶ $1 LOBBY' };
let selectedLobbyType2 = localStorage.getItem('duelseries_lobbytype2') || 'free';

(function restoreLobby2Selection() {
  const btn = document.querySelector(`.btn-lobby-type-2[data-type="${selectedLobbyType2}"]`);
  if (btn) {
    document.querySelectorAll('.btn-lobby-type-2').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const pb = document.getElementById('btn-play-2');
    if (pb) pb.textContent = (selectedLobbyType2 === 'free' ? '▶ ' : '') + LOBBY_LABELS_2[selectedLobbyType2];
  }
})();

document.querySelectorAll('.btn-lobby-type-2').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-lobby-type-2').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedLobbyType2 = btn.dataset.type;
    localStorage.setItem('duelseries_lobbytype2', selectedLobbyType2);
    const pb = document.getElementById('btn-play-2');
    pb.textContent = (selectedLobbyType2 === 'free' ? '▶ ' : '') + LOBBY_LABELS_2[selectedLobbyType2];
  });
});

document.getElementById('btn-play-2').addEventListener('click', async () => {
  const name = document.getElementById('player-name-2').value.replace(/\s/g, '') || 'Player';
  if (account && name !== account.name) {
    const r = await fetch('/auth/update-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    account.name = d.account.name;
  }
  localStorage.setItem('duelseries_playername', name);
  sessionStorage.setItem('playerName',    name);
  sessionStorage.setItem('walletAddress', account?.walletAddress || '');
  sessionStorage.setItem('googleId',      account?.googleId || '');
  sessionStorage.setItem('lobbyType',     selectedLobbyType2);
  sessionStorage.setItem('gameMode',      'cell');
  window.location.href = '/agar.html'; // future agar.io game page
});

document.getElementById('player-name-2').addEventListener('input', function() {
  this.value = this.value.replace(/\s/g, '');
  const v = this.value;
  if (v) localStorage.setItem('duelseries_playername', v);
  document.getElementById('play-username-2').textContent = v || '';
});

// ─── Save custom name to localStorage as user types ───────────────────────────
document.getElementById('player-name').addEventListener('input', function() {
  this.value = this.value.replace(/\s/g, '');
  const v = this.value;
  if (v) localStorage.setItem('duelseries_playername', v);
  document.getElementById('play-username').textContent = v || '';
});

// ─── Lobby type selection ──────────────────────────────────────────────────────
const LOBBY_LABELS = { free: 'FREE PLAY', dime: '▶ 10¢ LOBBY', dollar: '▶ $1 LOBBY' };
let selectedLobbyType = localStorage.getItem('duelseries_lobbytype') || 'free';

// Restore saved selection on page load
(function restoreLobbySelection() {
  const btn = document.querySelector(`.btn-lobby-type[data-type="${selectedLobbyType}"]`);
  if (btn) {
    document.querySelectorAll('.btn-lobby-type').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const playBtn = document.getElementById('btn-play');
    if (playBtn) playBtn.textContent = (selectedLobbyType === 'free' ? '▶ ' : '') + LOBBY_LABELS[selectedLobbyType];
  }
})();

document.querySelectorAll('.btn-lobby-type').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.btn-lobby-type').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedLobbyType = btn.dataset.type;
    localStorage.setItem('duelseries_lobbytype', selectedLobbyType);
    const playBtn = document.getElementById('btn-play');
    playBtn.textContent = (selectedLobbyType === 'free' ? '▶ ' : '') + LOBBY_LABELS[selectedLobbyType];
  });
});

// ─── Play ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click', async () => {
  const name = document.getElementById('player-name').value.replace(/\s/g, '') || 'Player';
  if (account && name !== account.name) {
    const r = await fetch('/auth/update-name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const d = await r.json();
    if (d.error) { alert(d.error); return; }
    account.name = d.account.name;
  }
  localStorage.setItem('duelseries_playername', name);
  sessionStorage.setItem('playerName',    name);
  sessionStorage.setItem('walletAddress', account?.walletAddress || '');
  sessionStorage.setItem('googleId',      account?.googleId || '');
  sessionStorage.setItem('snakeColor',    localStorage.getItem('duelseries_skin_color') || '#E8756A');
  sessionStorage.setItem('lobbyType',     selectedLobbyType);
  window.location.href = '/game.html';
});

// ─── Customize ────────────────────────────────────────────────────────────────
(function() {
  const SKINS = [
    { id: 'coral',   name: 'Coral Red Snake',  color: '#E8756A', locked: false },
    { id: 'teal',    name: 'Teal Snake',        color: '#4FC3C3', locked: false },
    { id: 'gold',    name: 'Gold Snake',        color: '#F5C842', locked: false },
    { id: 'pink',    name: 'Pink Snake',        color: '#E87FD4', locked: false },
    { id: 'purple',  name: 'Purple Snake',      color: '#8B5CF6', locked: false },
    { id: 'cyan',    name: 'Cyan Snake',        color: '#22D3EE', locked: false },
    { id: 'green',   name: 'Emerald Snake',     color: '#10B981', locked: false },
    { id: 'orange',  name: 'Orange Snake',      color: '#F97316', locked: false },
    { id: 'blue',    name: 'Blue Snake',        color: '#3B82F6', locked: false },
    { id: 'crimson', name: 'Crimson Snake',     color: '#EF4444', locked: true  },
    { id: 'mint',    name: 'Mint Snake',        color: '#6EE7B7', locked: true  },
    { id: 'indigo',  name: 'Indigo Snake',      color: '#6366F1', locked: true  },
    { id: 'rose',    name: 'Rose Snake',        color: '#FB7185', locked: true  },
    { id: 'amber',   name: 'Amber Snake',       color: '#F59E0B', locked: true  },
    { id: 'sky',     name: 'Sky Snake',         color: '#38BDF8', locked: true  },
    { id: 'lime',    name: 'Lime Snake',        color: '#84CC16', locked: true  },
    { id: 'galaxy',  name: 'Galaxy Snake',      color: '#7C3AED', locked: true  },
    { id: 'shadow',  name: 'Shadow Snake',      color: '#374151', locked: true  },
  ];

  let equippedId  = localStorage.getItem('duelseries_skin_id')    || 'coral';
  let selectedId  = equippedId;
  let currentCat  = 'skins';
  let previewAnim = null;

  // ── Snake preview drawing ────────────────────────────────────────────────────
  function drawMiniSnake(canvas, color) {
    const W = canvas.width  = canvas.offsetWidth  || 400;
    const H = canvas.height = canvas.offsetHeight || 130;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);

    const R  = Math.max(9, H * 0.085);
    const cx = W * 0.78, cy = H * 0.5;
    const amp = H * 0.22, freq = 0.055, step = 3.5;
    const N = Math.floor((W * 0.85) / step);

    // Build smooth points: gentle horizontal S-curve
    const pts = [];
    for (let i = 0; i < N; i++) {
      pts.push({
        x: cx - i * step,
        y: cy + Math.sin(i * freq) * amp,
      });
    }

    function strokePath(lw, style) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i+1].x) / 2;
        const my = (pts[i].y + pts[i+1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      ctx.lineTo(pts[pts.length-1].x, pts[pts.length-1].y);
      ctx.strokeStyle = style;
      ctx.lineWidth   = lw;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();
    }

    // Segment rings
    let dist = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
      dist += Math.sqrt(dx*dx + dy*dy);
      if (dist >= R * 1.3) {
        dist -= R * 1.3;
        const ax = pts[Math.min(i+1,pts.length-1)].x - pts[i-1].x;
        const ay = pts[Math.min(i+1,pts.length-1)].y - pts[i-1].y;
        const al = Math.sqrt(ax*ax + ay*ay) || 1;
        const px = -ay/al, py = ax/al;
        ctx.beginPath();
        ctx.moveTo(pts[i].x + px*(R-1), pts[i].y + py*(R-1));
        ctx.lineTo(pts[i].x - px*(R-1), pts[i].y - py*(R-1));
        ctx.strokeStyle = 'rgba(0,0,0,0.20)';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    strokePath(R * 2,    color);
    strokePath(R * 1.15, 'rgba(0,0,0,0.28)');
    strokePath(R * 0.65, 'rgba(255,255,255,0.28)');

    // Segment rings on top
    dist = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const dx = pts[i].x - pts[i-1].x, dy = pts[i].y - pts[i-1].y;
      dist += Math.sqrt(dx*dx + dy*dy);
      if (dist >= R * 1.3) {
        dist -= R * 1.3;
        const ax = pts[Math.min(i+1,pts.length-1)].x - pts[i-1].x;
        const ay = pts[Math.min(i+1,pts.length-1)].y - pts[i-1].y;
        const al = Math.sqrt(ax*ax + ay*ay) || 1;
        const px = -ay/al, py = ax/al;
        ctx.beginPath();
        ctx.moveTo(pts[i].x + px*(R-1), pts[i].y + py*(R-1));
        ctx.lineTo(pts[i].x - px*(R-1), pts[i].y - py*(R-1));
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.lineWidth = 1.8;
        ctx.lineCap = 'round';
        ctx.stroke();
      }
    }

    // Head
    const hx = pts[0].x, hy = pts[0].y;
    const HR = R + Math.max(3, R * 0.35);
    ctx.beginPath(); ctx.arc(hx, hy, HR, 0, Math.PI*2);
    ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, HR, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
    ctx.beginPath(); ctx.arc(hx - HR*0.18, hy - HR*0.22, HR*0.55, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
    ctx.beginPath(); ctx.arc(hx, hy, HR, 0, Math.PI*2);
    ctx.fillStyle = color; ctx.globalAlpha = 0.4; ctx.fill(); ctx.globalAlpha = 1;

    // Eyes
    const ang  = Math.atan2(pts[0].y - pts[1].y, pts[0].x - pts[1].x);
    const perpX = -Math.sin(ang), perpY = Math.cos(ang);
    const eyeR  = HR * 0.40;
    for (const s of [-1, 1]) {
      const ex = hx + perpX*HR*0.36*s + Math.cos(ang)*HR*0.50;
      const ey = hy + perpY*HR*0.36*s + Math.sin(ang)*HR*0.50;
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI*2);
      ctx.fillStyle = '#f2f2f2'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex + Math.cos(ang)*eyeR*0.2, ey + Math.sin(ang)*eyeR*0.2, eyeR*0.62, 0, Math.PI*2);
      ctx.fillStyle = '#111'; ctx.fill();
    }
  }

  // Which lobby opened the customize modal (1=snake preview, 2=circle preview)
  let custLobby = 1;

  function darkenHex(hex) {
    const n = parseInt(hex.replace('#',''), 16);
    return `rgb(${Math.max(0,(n>>16)-60)},${Math.max(0,((n>>8)&0xff)-60)},${Math.max(0,(n&0xff)-60)})`;
  }

  function drawMiniCell(canvas, color) {
    const W = canvas.width  = canvas.offsetWidth  || 400;
    const H = canvas.height = canvas.offsetHeight || 130;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const r = Math.min(W, H) * 0.38;
    const cx = W / 2, cy = H / 2;
    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur  = r * 0.45;
    ctx.shadowOffsetY = r * 0.08;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill();
    ctx.restore();
    // Dark border
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = darkenHex(color);
    ctx.lineWidth = r * 0.08; ctx.stroke();
    // Radial glint
    const gx = cx - r * 0.28, gy = cy - r * 0.28;
    const gl = ctx.createRadialGradient(gx, gy, 0, gx, gy, r * 0.72);
    gl.addColorStop(0,   'rgba(255,255,255,0.52)');
    gl.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    gl.addColorStop(1,   'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = gl; ctx.fill();
  }

  function refreshMiniCanvas() {
    const skin = SKINS.find(s => s.id === equippedId) || SKINS[0];
    const c1 = document.getElementById('customize-preview');
    if (c1) drawMiniSnake(c1, skin.color);
    const c2 = document.getElementById('customize-preview-2');
    if (c2) drawMiniCell(c2, skin.color);
  }

  // ── Modal preview ───────────────────────────────────────────────────────────
  function drawModalPreview(color) {
    const canvas = document.getElementById('cust-snake-canvas');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth  || 820;
    canvas.height = canvas.offsetHeight || 130;
    if (custLobby === 2) drawMiniCell(canvas, color);
    else drawMiniSnake(canvas, color);
  }

  function drawModalSnake(color) { drawModalPreview(color); }

  // ── Grid rendering ──────────────────────────────────────────────────────────
  function renderGrid() {
    const grid = document.getElementById('cust-grid');
    grid.innerHTML = '';

    if (currentCat === 'hats' || currentCat === 'boosts') {
      grid.innerHTML = `<div class="cust-placeholder">Coming soon...</div>`;
      document.getElementById('cust-det-swatch').style.background = '#222';
      document.getElementById('cust-det-name').textContent = '—';
      document.getElementById('cust-det-badge').classList.add('hidden');
      document.getElementById('cust-det-type').textContent = '—';
      document.getElementById('btn-equip').classList.add('hidden');
      return;
    }

    SKINS.forEach(skin => {
      const div = document.createElement('div');
      div.className = 'cust-swatch' + (skin.locked ? ' cs-lock' : '') + (skin.id === selectedId ? ' cs-sel' : '');
      div.style.background = skin.color;
      div.dataset.id = skin.id;
      if (!skin.locked) {
        div.addEventListener('click', () => selectSkin(skin.id));
      }
      grid.appendChild(div);
    });
    updateDetails();
  }

  function selectSkin(id) {
    selectedId = id;
    document.querySelectorAll('.cust-swatch').forEach(el => el.classList.toggle('cs-sel', el.dataset.id === id));
    updateDetails();
    const skin = SKINS.find(s => s.id === id);
    if (skin) drawModalPreview(skin.color);
  }

  function updateDetails() {
    const skin = SKINS.find(s => s.id === selectedId);
    if (!skin) return;
    const swatch = document.getElementById('cust-det-swatch');
    swatch.style.background = skin.color;
    document.getElementById('cust-det-name').textContent = skin.name;
    document.getElementById('cust-det-type').textContent = 'Color';
    const badge  = document.getElementById('cust-det-badge');
    const equip  = document.getElementById('btn-equip');
    if (skin.id === equippedId) {
      badge.classList.remove('hidden');
      equip.classList.add('hidden');
    } else {
      badge.classList.add('hidden');
      equip.classList.remove('hidden');
    }
  }

  // ── Equip ───────────────────────────────────────────────────────────────────
  document.getElementById('btn-equip').addEventListener('click', () => {
    const skin = SKINS.find(s => s.id === selectedId);
    if (!skin || skin.locked) return;
    equippedId = skin.id;
    localStorage.setItem('duelseries_skin_id',    skin.id);
    localStorage.setItem('duelseries_skin_color', skin.color);
    updateDetails();
    refreshMiniCanvas();
  });

  // ── Shop tab content ─────────────────────────────────────────────────────────
  function showShop() {
    const body = document.querySelector('.cust-body');
    body.innerHTML = `
      <div class="cust-shop-panel">
        <div class="cust-shop-badge">⭐ DuelSeries Premium</div>
        <div class="cust-shop-price">$6.49 <span>USD / Month</span></div>
        <ul class="cust-shop-perks">
          <li><span class="perk-icon">⚪</span> Circle Scripts</li>
          <li><span class="perk-icon">🌐</span> Infinite Viewing Range</li>
          <li><span class="perk-icon">🎨</span> Access to All Skins &amp; Hats</li>
          <li><span class="perk-icon">👑</span> Legendary Crown</li>
        </ul>
        <button class="btn-subscribe">Subscribe Now</button>
        <div class="cust-shop-note">Cancel anytime &nbsp;·&nbsp; Billed monthly</div>
      </div>
    `;
  }

  function showInventory() {
    const body = document.querySelector('.cust-body');
    body.innerHTML = `
      <div class="cust-grid-wrap">
        <div class="cust-grid" id="cust-grid"></div>
      </div>
      <div class="cust-details">
        <div class="cust-det-swatch" id="cust-det-swatch"></div>
        <div class="cust-det-name"   id="cust-det-name">Select a skin</div>
        <div class="cust-det-badge hidden" id="cust-det-badge">● Equipped</div>
        <div class="cust-det-divider">DETAILS</div>
        <div class="cust-det-row"><span>Type</span><strong id="cust-det-type">—</strong></div>
        <button class="btn-equip hidden" id="btn-equip">Equip</button>
      </div>
    `;
    document.getElementById('btn-equip').addEventListener('click', () => {
      const skin = SKINS.find(s => s.id === selectedId);
      if (!skin || skin.locked) return;
      equippedId = skin.id;
      localStorage.setItem('duelseries_skin_id',    skin.id);
      localStorage.setItem('duelseries_skin_color', skin.color);
      updateDetails();
      refreshMiniCanvas();
    });
    renderGrid();
  }

  // ── Tabs ─────────────────────────────────────────────────────────────────────
  document.querySelectorAll('.cust-top-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cust-top-tab').forEach(b => b.classList.remove('ctt-active'));
      btn.classList.add('ctt-active');
      if (btn.dataset.top === 'shop') {
        showShop();
      } else {
        showInventory();
      }
    });
  });

  document.querySelectorAll('.cust-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.cust-cat').forEach(b => b.classList.remove('cc-active'));
      btn.classList.add('cc-active');
      currentCat = btn.dataset.cat;
      renderGrid();
    });
  });

  // ── Open / close ─────────────────────────────────────────────────────────────
  function openCustomize(lobbyNum) {
    custLobby = lobbyNum;
    selectedId = equippedId;
    currentCat = 'skins';
    document.querySelectorAll('.cust-cat').forEach(b => b.classList.toggle('cc-active', b.dataset.cat === 'skins'));
    document.querySelectorAll('.cust-top-tab').forEach(b => b.classList.toggle('ctt-active', b.dataset.top === 'inventory'));
    document.getElementById('modal-customize').classList.add('active');
    renderGrid();
    requestAnimationFrame(() => {
      const skin = SKINS.find(s => s.id === equippedId) || SKINS[0];
      drawModalPreview(skin.color);
    });
  }

  document.getElementById('btn-change-appearance').addEventListener('click', () => openCustomize(1));
  document.getElementById('btn-change-appearance-2').addEventListener('click', () => openCustomize(2));

  document.getElementById('close-customize').addEventListener('click', () => {
    document.getElementById('modal-customize').classList.remove('active');
  });

  document.getElementById('modal-customize').addEventListener('click', function(e) {
    if (e.target === this) this.classList.remove('active');
  });

  // Draw mini canvas on load (after a tick so layout is done)
  setTimeout(refreshMiniCanvas, 100);
})();

// ─── Lobby snake animation ────────────────────────────────────────────────────
(function() {
  const canvas = document.getElementById('snake-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const COLORS = [
    '#1ECEA8', '#F5C020', '#E85DA8', '#5B8CFF',
    '#FF6B35', '#A855F7', '#34D399', '#F87171',
    '#FBBF24', '#38BDF8',
  ];

  const R     = 18;
  const SPEED = 1.2;
  const TRAIL = 280;
  const TURN  = 0.018;

  function makeSnake(color, W, H) {
    const angle = Math.random() * Math.PI * 2;
    const x = Math.random() * W;
    const y = Math.random() * H;
    const trail = [];
    for (let t = 0; t < TRAIL; t++)
      trail.push({ x: x - Math.cos(angle) * t * SPEED, y: y - Math.sin(angle) * t * SPEED });
    return { x, y, angle, color, trail, turnDir: 1, turnTimer: 60 + Math.random() * 120 };
  }

  let snakes = [];
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    snakes = COLORS.map(c => makeSnake(c, canvas.width, canvas.height));
  }
  resize();
  window.addEventListener('resize', resize);

  function update(s) {
    const W = canvas.width, H = canvas.height;
    s.turnTimer--;
    if (s.turnTimer <= 0) {
      s.turnDir   = (Math.random() < 0.5 ? -1 : 1);
      s.turnTimer = 80 + Math.random() * 130;
    }
    s.angle += s.turnDir * TURN;

    s.x += Math.cos(s.angle) * SPEED;
    s.y += Math.sin(s.angle) * SPEED;

    // Wrap around screen edges
    const pad = R * 3;
    if (s.x < -pad)    s.x += W + pad * 2;
    if (s.x > W + pad) s.x -= W + pad * 2;
    if (s.y < -pad)    s.y += H + pad * 2;
    if (s.y > H + pad) s.y -= H + pad * 2;

    s.trail.unshift({ x: s.x, y: s.y });
    if (s.trail.length > TRAIL) s.trail.pop();
  }

  function drawTrailPass(t, len, wrapThresh, strokeStyle, lineWidth) {
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth   = lineWidth;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < len; i++) {
      if (i > 0) {
        const dx = Math.abs(t[i].x - t[i-1].x), dy = Math.abs(t[i].y - t[i-1].y);
        if (dx > wrapThresh || dy > wrapThresh) {
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(t[i].x, t[i].y);
          started = true;
          continue;
        }
      }
      if (!started || i === 0) { ctx.moveTo(t[i].x, t[i].y); started = true; }
      else ctx.lineTo(t[i].x, t[i].y);
    }
    ctx.stroke();
  }

  function drawSnake(s) {
    if (s.trail.length < 4) return;
    const t = s.trail, len = t.length;
    const W = canvas.width, H = canvas.height;
    const wrapThresh = Math.min(W, H) * 0.35;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    drawTrailPass(t, len, wrapThresh, s.color,                  R * 2);
    drawTrailPass(t, len, wrapThresh, 'rgba(0,0,0,0.28)',       R * 1.2);
    drawTrailPass(t, len, wrapThresh, 'rgba(255,255,255,0.30)', R * 0.72);

    // Segment rings
    let dist = 0;
    for (let i = 1; i < len - 1; i++) {
      const dx = t[i].x - t[i-1].x, dy = t[i].y - t[i-1].y;
      const d = Math.sqrt(dx*dx + dy*dy);
      if (d > wrapThresh) { dist = 0; continue; }
      dist += d;
      if (dist >= 13) {
        dist -= 13;
        const ax = t[Math.min(i+1,len-1)].x - t[i-1].x;
        const ay = t[Math.min(i+1,len-1)].y - t[i-1].y;
        const al = Math.sqrt(ax*ax + ay*ay) || 1;
        const px = -ay/al, py = ax/al;
        ctx.beginPath();
        ctx.moveTo(t[i].x + px*(R-1), t[i].y + py*(R-1));
        ctx.lineTo(t[i].x - px*(R-1), t[i].y - py*(R-1));
        ctx.strokeStyle = 'rgba(0,0,0,0.22)';
        ctx.lineWidth   = 2.5;
        ctx.stroke();
      }
    }

    // Head dome
    const HR = R + 5;
    ctx.beginPath(); ctx.arc(s.x, s.y, HR, 0, Math.PI*2);
    ctx.fillStyle = s.color; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, HR, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x - HR*0.18, s.y - HR*0.22, HR*0.55, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.24)'; ctx.fill();
    ctx.beginPath(); ctx.arc(s.x, s.y, HR, 0, Math.PI*2);
    ctx.fillStyle = s.color; ctx.globalAlpha = 0.45; ctx.fill();
    ctx.globalAlpha = 1;

    // Eyes
    const perpX = -Math.sin(s.angle), perpY = Math.cos(s.angle);
    const fwdX  =  Math.cos(s.angle), fwdY  = Math.sin(s.angle);
    const eyeSep = HR * 0.36, eyeFwd = HR * 0.52, eyeR = HR * 0.42;
    for (const side of [-1, 1]) {
      const ex = s.x + perpX*eyeSep*side + fwdX*eyeFwd;
      const ey = s.y + perpY*eyeSep*side + fwdY*eyeFwd;
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI*2);
      ctx.fillStyle = '#f2f2f2'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex + fwdX*eyeR*0.18, ey + fwdY*eyeR*0.18, eyeR*0.64, 0, Math.PI*2);
      ctx.fillStyle = '#111'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex - eyeR*0.18, ey - eyeR*0.28, eyeR*0.26, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.fill();
    }

    ctx.restore();
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    snakes.forEach(s => { update(s); drawSnake(s); });
    requestAnimationFrame(loop);
  }
  loop();
})();
