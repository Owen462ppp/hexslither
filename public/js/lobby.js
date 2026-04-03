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
  const savedName = localStorage.getItem('hexslither_playername');
  const displayName = savedName || account.name || 'Player';
  document.getElementById('player-name').value          = displayName;
  document.getElementById('play-username').textContent  = displayName;
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

// Save custom name to localStorage as user types
document.getElementById('player-name').addEventListener('input', function() {
  const v = this.value.trim();
  if (v) localStorage.setItem('hexslither_playername', v);
  document.getElementById('play-username').textContent = v || account?.name || 'Player';
});

// ─── Play ─────────────────────────────────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim() || account?.name || 'Player';
  localStorage.setItem('hexslither_playername', name);
  sessionStorage.setItem('playerName',    name);
  sessionStorage.setItem('walletAddress', account?.walletAddress || '');
  sessionStorage.setItem('googleId',      account?.googleId || '');
  sessionStorage.setItem('snakeColor',    localStorage.getItem('hexslither_skin_color') || '#E8756A');
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

  let equippedId  = localStorage.getItem('hexslither_skin_id')    || 'coral';
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

  function refreshMiniCanvas() {
    const skin = SKINS.find(s => s.id === equippedId) || SKINS[0];
    const c = document.getElementById('customize-preview');
    if (c) drawMiniSnake(c, skin.color);
  }

  // ── Modal preview ───────────────────────────────────────────────────────────
  function drawModalSnake(color) {
    const canvas = document.getElementById('cust-snake-canvas');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth  || 820;
    canvas.height = canvas.offsetHeight || 130;
    drawMiniSnake(canvas, color);
  }

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
    if (skin) drawModalSnake(skin.color);
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
    localStorage.setItem('hexslither_skin_id',    skin.id);
    localStorage.setItem('hexslither_skin_color', skin.color);
    updateDetails();
    refreshMiniCanvas();
  });

  // ── Shop tab content ─────────────────────────────────────────────────────────
  function showShop() {
    const body = document.querySelector('.cust-body');
    body.innerHTML = `
      <div class="cust-shop-panel">
        <div class="cust-shop-badge">⭐ HexSlither Premium</div>
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
      localStorage.setItem('hexslither_skin_id',    skin.id);
      localStorage.setItem('hexslither_skin_color', skin.color);
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
  document.getElementById('btn-change-appearance').addEventListener('click', () => {
    selectedId = equippedId;
    currentCat = 'skins';
    document.querySelectorAll('.cust-cat').forEach(b => b.classList.toggle('cc-active', b.dataset.cat === 'skins'));
    document.querySelectorAll('.cust-top-tab').forEach(b => b.classList.toggle('ctt-active', b.dataset.top === 'inventory'));
    document.getElementById('modal-customize').classList.add('active');
    renderGrid();
    requestAnimationFrame(() => {
      const skin = SKINS.find(s => s.id === equippedId) || SKINS[0];
      drawModalSnake(skin.color);
    });
  });

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
