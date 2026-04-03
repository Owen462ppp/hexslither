// ─── Hex background ───────────────────────────────────────────────────────────
(function() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  const R = 42, GAP = 3, INNER_R = R - GAP;
  const COL_STEP = R * 1.5, ROW_STEP = Math.sqrt(3) * R;

  function buildVerts(r) {
    const v = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      v.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return v;
  }
  const OV = buildVerts(R), IV = buildVerts(INNER_R);

  function p(verts, cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx + verts[0].x, cy + verts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(cx + verts[i].x, cy + verts[i].y);
    ctx.closePath();
  }

  function drawHex(cx, cy) {
    // Outer gap — exactly matches HexGrid.js in-game
    p(OV, cx, cy); ctx.fillStyle = '#03080f'; ctx.fill();
    // Hex face
    p(IV, cx, cy); ctx.fillStyle = '#0b1a2e'; ctx.fill();
    // Top-left highlight
    ctx.beginPath();
    ctx.moveTo(cx+IV[4].x,cy+IV[4].y); ctx.lineTo(cx+IV[5].x,cy+IV[5].y);
    ctx.lineTo(cx+IV[0].x,cy+IV[0].y); ctx.lineTo(cx+IV[1].x,cy+IV[1].y);
    ctx.strokeStyle='rgba(255,255,255,0.06)'; ctx.lineWidth=2; ctx.stroke();
    // Bottom-right shadow
    ctx.beginPath();
    ctx.moveTo(cx+IV[1].x,cy+IV[1].y); ctx.lineTo(cx+IV[2].x,cy+IV[2].y);
    ctx.lineTo(cx+IV[3].x,cy+IV[3].y); ctx.lineTo(cx+IV[4].x,cy+IV[4].y);
    ctx.strokeStyle='rgba(0,0,0,0.45)'; ctx.lineWidth=2; ctx.stroke();
  }

  function draw() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#03080f'; ctx.fillRect(0, 0, W, H);
    const cols = Math.ceil(W / COL_STEP) + 3, rows = Math.ceil(H / ROW_STEP) + 3;
    for (let col = -1; col < cols; col++)
      for (let row = -1; row < rows; row++) {
        const cx = col * COL_STEP, cy = row * ROW_STEP + (col % 2 === 0 ? 0 : ROW_STEP / 2);
        drawHex(cx, cy);
      }
  }
  draw();
  window.addEventListener('resize', draw);
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
socket.on(CONSTANTS.EVENTS.LOBBY_STATE, ({ playerCount, leaderboard }) => {
  const a = document.getElementById('stat-players');
  const b = document.getElementById('stat-players-login');
  if (a) a.textContent = playerCount;
  if (b) b.textContent = playerCount;
  updateLobbyLeaderboard(leaderboard);
});

socket.on(CONSTANTS.EVENTS.WALLET_BALANCE, ({ balance }) => {
  setBalance(balance);
});

socket.on(CONSTANTS.EVENTS.ERROR, ({ message }) => alert('Error: ' + message));

// ─── Lobby UI ─────────────────────────────────────────────────────────────────
function showLobby() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('lobby-screen').classList.remove('hidden');

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
  document.getElementById('player-name').value          = account.name || 'Player';
  document.getElementById('play-username').textContent  = account.name || 'Player';
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

// ─── Wallet ───────────────────────────────────────────────────────────────────
let walletInfo = null;

fetch('/wallet/info').then(r => r.json()).then(info => {
  if (info && info.escrowAddress) walletInfo = info;
}).catch(() => {});

function setBalance(bal) {
  const formatted = parseFloat(bal).toFixed(4);
  document.getElementById('game-balance').textContent = formatted + ' SOL';
  const sb = document.getElementById('sidebar-balance');
  if (sb) sb.textContent = formatted;
}

function walletStatus(msg, isError) {
  const el = document.getElementById('wallet-status');
  if (el) { el.textContent = msg; el.style.color = isError ? '#ff6666' : '#14F195'; }
}

fetch('/auth/me').then(r => r.json()).then(({ account: acc }) => {
  if (acc) setBalance(acc.balance || 0);
});

document.getElementById('btn-refresh-balance').addEventListener('click', async () => {
  const btn = document.getElementById('btn-refresh-balance');
  btn.style.opacity = '0.4';
  const res = await fetch('/auth/me');
  const { account: acc } = await res.json();
  if (acc) setBalance(acc.balance || 0);
  btn.style.opacity = '1';
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

// ─── Play ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim() || account?.name || 'Player';
  sessionStorage.setItem('playerName',    name);
  sessionStorage.setItem('walletAddress', account?.walletAddress || '');
  sessionStorage.setItem('googleId',      account?.googleId || '');
  window.location.href = '/game.html';
});

// ─── Lobby snake animation ─────────────────────────────────────────────────────
(function() {
  const canvas = document.getElementById('snake-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const SNAKE_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#9b59b6',
    '#f39c12', '#1abc9c', '#e91e63', '#00bcd4',
  ];

  const RADIUS = 10;       // body segment radius
  const SPEED  = 1.4;      // px per frame
  const TRAIL  = 120;      // history length
  const TURN   = 0.022;    // max turn per frame (radians)

  function makeSnake(i) {
    const W = window.innerWidth, H = window.innerHeight;
    const angle = Math.random() * Math.PI * 2;
    const x = Math.random() * W, y = Math.random() * H;
    const color = SNAKE_COLORS[i % SNAKE_COLORS.length];
    // Pre-fill trail so snake appears full-length immediately
    const trail = [];
    for (let t = 0; t < TRAIL; t++) {
      trail.push({ x: x - Math.cos(angle) * t * SPEED, y: y - Math.sin(angle) * t * SPEED });
    }
    return { x, y, angle, color, trail, turnDir: (Math.random() < 0.5 ? 1 : -1), turnTimer: 0 };
  }

  const snakes = Array.from({ length: 6 }, (_, i) => makeSnake(i));

  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  function update(s) {
    const W = canvas.width, H = canvas.height;

    // Occasionally change turn direction
    s.turnTimer--;
    if (s.turnTimer <= 0) {
      s.turnDir   = Math.random() < 0.5 ? 1 : -1;
      s.turnTimer = 40 + Math.random() * 120;
    }

    // Steer away from edges
    const margin = 120;
    if (s.x < margin)        s.angle += TURN * 2;
    else if (s.x > W - margin) s.angle -= TURN * 2;
    if (s.y < margin)        s.angle += TURN * 2;
    else if (s.y > H - margin) s.angle -= TURN * 2;

    s.angle += s.turnDir * TURN * (0.3 + Math.random() * 0.7);
    s.x += Math.cos(s.angle) * SPEED;
    s.y += Math.sin(s.angle) * SPEED;

    // Soft clamp
    s.x = Math.max(RADIUS, Math.min(W - RADIUS, s.x));
    s.y = Math.max(RADIUS, Math.min(H - RADIUS, s.y));

    s.trail.unshift({ x: s.x, y: s.y });
    if (s.trail.length > TRAIL) s.trail.pop();
  }

  function drawSnake(s) {
    if (s.trail.length < 2) return;
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // Body — draw as connected path
    const segs = s.trail.length;
    ctx.beginPath();
    ctx.moveTo(s.trail[0].x, s.trail[0].y);
    for (let i = 1; i < segs; i++) ctx.lineTo(s.trail[i].x, s.trail[i].y);
    const fade = ctx.createLinearGradient(
      s.trail[0].x, s.trail[0].y,
      s.trail[segs - 1].x, s.trail[segs - 1].y
    );
    fade.addColorStop(0,   s.color);
    fade.addColorStop(0.6, s.color + 'aa');
    fade.addColorStop(1,   s.color + '00');
    ctx.strokeStyle = fade;
    ctx.lineWidth   = RADIUS * 2;
    ctx.stroke();

    // Head circle
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.arc(s.x, s.y, RADIUS + 2, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();

    // Eyes
    ctx.globalAlpha = 1;
    const eyeAngle1 = s.angle - 0.45;
    const eyeAngle2 = s.angle + 0.45;
    const eyeDist   = RADIUS * 0.65;
    [[eyeAngle1], [eyeAngle2]].forEach(([a]) => {
      const ex = s.x + Math.cos(a) * eyeDist;
      const ey = s.y + Math.sin(a) * eyeDist;
      ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.beginPath(); ctx.arc(ex + 0.8, ey + 0.8, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#111'; ctx.fill();
    });

    ctx.restore();
  }

  function loop() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    snakes.forEach(s => { update(s); drawSnake(s); });
    requestAnimationFrame(loop);
  }
  loop();
})();
