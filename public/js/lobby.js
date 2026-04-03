// ─── Hex background ───────────────────────────────────────────────────────────
(function() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  const R = 42, GAP = 4, INNER_R = R - GAP;
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
    // Gap — very dark near-black navy
    p(OV, cx, cy); ctx.fillStyle = '#070b12'; ctx.fill();
    // Hex face — rich blue-slate
    p(IV, cx, cy); ctx.fillStyle = '#1b2a3e'; ctx.fill();
    // Top-left highlight — bright, thick
    ctx.beginPath();
    ctx.moveTo(cx+IV[4].x,cy+IV[4].y); ctx.lineTo(cx+IV[5].x,cy+IV[5].y);
    ctx.lineTo(cx+IV[0].x,cy+IV[0].y); ctx.lineTo(cx+IV[1].x,cy+IV[1].y);
    ctx.strokeStyle='rgba(255,255,255,0.18)'; ctx.lineWidth=3; ctx.stroke();
    // Bottom-right shadow — dark, thick
    ctx.beginPath();
    ctx.moveTo(cx+IV[1].x,cy+IV[1].y); ctx.lineTo(cx+IV[2].x,cy+IV[2].y);
    ctx.lineTo(cx+IV[3].x,cy+IV[3].y); ctx.lineTo(cx+IV[4].x,cy+IV[4].y);
    ctx.strokeStyle='rgba(0,0,0,0.50)'; ctx.lineWidth=3; ctx.stroke();
  }

  function draw() {
    canvas.width = window.innerWidth; canvas.height = window.innerHeight;
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = '#070b12'; ctx.fillRect(0, 0, W, H);
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

// ─── Lobby snake animation (DamnBruh style) ───────────────────────────────────
(function() {
  const canvas = document.getElementById('snake-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // 3 snakes like DamnBruh: teal bottom-left, gold top-right, pink bottom-right
  const CONFIGS = [
    { color: '#1ECEA8', zoneX: 0, zoneY: 1, angle:  -0.6 }, // teal,  bottom-left
    { color: '#F5C020', zoneX: 1, zoneY: 0, angle:  -2.4 }, // gold,  top-right
    { color: '#E85DA8', zoneX: 1, zoneY: 1, angle:   2.5 }, // pink,  bottom-right
  ];

  const R     = 20;    // body radius — thick like DamnBruh
  const SPEED = 1.1;
  const TRAIL = 200;
  const TURN  = 0.016;

  function makeSnake(cfg, W, H) {
    const pad = 180;
    const x = cfg.zoneX === 0 ? pad + Math.random() * 120 : W - pad - Math.random() * 120;
    const y = cfg.zoneY === 0 ? pad + Math.random() * 100 : H - pad - Math.random() * 120;
    const trail = [];
    for (let t = 0; t < TRAIL; t++)
      trail.push({ x: x - Math.cos(cfg.angle) * t * SPEED, y: y - Math.sin(cfg.angle) * t * SPEED });
    return { x, y, angle: cfg.angle, color: cfg.color, trail, turnDir: 1, turnTimer: 60, zone: cfg };
  }

  let snakes = [];
  function resize() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    snakes = CONFIGS.map(c => makeSnake(c, canvas.width, canvas.height));
  }
  resize();
  window.addEventListener('resize', resize);

  function update(s) {
    const W = canvas.width, H = canvas.height;
    s.turnTimer--;
    if (s.turnTimer <= 0) {
      s.turnDir   = -s.turnDir;
      s.turnTimer = 70 + Math.random() * 110;
    }

    // Stay in zone (corner area)
    const zx = s.zone.zoneX === 0 ? 0 : W;
    const zy = s.zone.zoneY === 0 ? 0 : H;
    const dx = zx - s.x, dy = zy - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 340) {
      const toward = Math.atan2(dy, dx);
      let diff = toward - s.angle;
      while (diff >  Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      s.angle += Math.sign(diff) * TURN * 1.8;
    } else {
      s.angle += s.turnDir * TURN;
    }

    s.x += Math.cos(s.angle) * SPEED;
    s.y += Math.sin(s.angle) * SPEED;
    s.x = Math.max(R, Math.min(W - R, s.x));
    s.y = Math.max(R, Math.min(H - R, s.y));
    s.trail.unshift({ x: s.x, y: s.y });
    if (s.trail.length > TRAIL) s.trail.pop();
  }

  function drawSnake(s) {
    if (s.trail.length < 4) return;
    const t = s.trail;
    const len = t.length;
    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // 1. Base body
    ctx.beginPath();
    ctx.moveTo(t[0].x, t[0].y);
    for (let i = 1; i < len; i++) ctx.lineTo(t[i].x, t[i].y);
    ctx.strokeStyle = s.color;
    ctx.lineWidth   = R * 2;
    ctx.globalAlpha = 1;
    ctx.stroke();

    // 2. Bottom shadow band (darker lower half → 3D tube look)
    ctx.beginPath();
    ctx.moveTo(t[0].x, t[0].y);
    for (let i = 1; i < len; i++) ctx.lineTo(t[i].x, t[i].y);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth   = R * 1.2;
    ctx.globalAlpha = 1;
    ctx.stroke();

    // 3. Top highlight (bright center stripe)
    ctx.beginPath();
    ctx.moveTo(t[0].x, t[0].y);
    for (let i = 1; i < len; i++) ctx.lineTo(t[i].x, t[i].y);
    ctx.strokeStyle = 'rgba(255,255,255,0.32)';
    ctx.lineWidth   = R * 0.75;
    ctx.stroke();

    // 4. Segment rings — perpendicular dark lines like slither.io
    ctx.lineCap = 'round';
    let dist = 0;
    for (let i = 1; i < len - 1; i++) {
      const dx = t[i].x - t[i-1].x, dy = t[i].y - t[i-1].y;
      dist += Math.sqrt(dx*dx + dy*dy);
      if (dist >= 13) {
        dist -= 13;
        // Use next point for smooth perpendicular
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

    // 5. Head — dome, same color, slightly bigger
    const HR = R + 6;
    ctx.lineCap = 'round';
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(s.x, s.y, HR, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.fill();

    // Head bottom shadow
    ctx.beginPath();
    ctx.arc(s.x, s.y, HR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fill();

    // Head top highlight blob
    ctx.beginPath();
    ctx.arc(s.x - HR * 0.18, s.y - HR * 0.22, HR * 0.58, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.26)';
    ctx.fill();

    // Re-fill head center to restore color after shadows
    ctx.beginPath();
    ctx.arc(s.x, s.y, HR, 0, Math.PI * 2);
    ctx.fillStyle = s.color;
    ctx.globalAlpha = 0.45;
    ctx.fill();
    ctx.globalAlpha = 1;

    // 6. Eyes — large, close together, slither.io style
    const perpX = -Math.sin(s.angle), perpY = Math.cos(s.angle);
    const fwdX  =  Math.cos(s.angle), fwdY  = Math.sin(s.angle);
    const eyeSep = HR * 0.36;   // close together
    const eyeFwd = HR * 0.52;   // pushed forward on head
    const eyeR   = HR * 0.42;   // large eyes

    for (const side of [-1, 1]) {
      const ex = s.x + perpX * eyeSep * side + fwdX * eyeFwd;
      const ey = s.y + perpY * eyeSep * side + fwdY * eyeFwd;
      // Sclera
      ctx.beginPath(); ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = '#f2f2f2'; ctx.fill();
      // Large black pupil
      ctx.beginPath();
      ctx.arc(ex + fwdX * eyeR * 0.18, ey + fwdY * eyeR * 0.18, eyeR * 0.64, 0, Math.PI * 2);
      ctx.fillStyle = '#111111'; ctx.fill();
      // White glint
      ctx.beginPath();
      ctx.arc(ex - eyeR * 0.18, ey - eyeR * 0.28, eyeR * 0.26, 0, Math.PI * 2);
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
