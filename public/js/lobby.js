// ─── Hex background ───────────────────────────────────────────────────────────
(function() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  const R = 42, GAP = 5, INNER_R = R - GAP;
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
    p(OV, cx, cy); ctx.fillStyle = '#03080f'; ctx.fill();
    p(IV, cx, cy); ctx.fillStyle = '#0b1929'; ctx.fill();
    const gx = cx - INNER_R * 0.3, gy = cy - INNER_R * 0.3;
    const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, INNER_R * 1.6);
    grad.addColorStop(0,    'rgba(25,65,110,0.85)');
    grad.addColorStop(0.45, 'rgba(12,28,55,0.6)');
    grad.addColorStop(1,    'rgba(0,0,0,0.75)');
    p(IV, cx, cy); ctx.fillStyle = grad; ctx.fill();
    ctx.save(); p(IV, cx, cy); ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cx+IV[1].x,cy+IV[1].y); ctx.lineTo(cx+IV[2].x,cy+IV[2].y);
    ctx.lineTo(cx+IV[3].x,cy+IV[3].y); ctx.lineTo(cx+IV[4].x,cy+IV[4].y);
    ctx.strokeStyle='rgba(0,0,0,0.7)'; ctx.lineWidth=GAP*2; ctx.stroke();
    ctx.restore();
    ctx.save(); p(IV, cx, cy); ctx.clip();
    ctx.beginPath();
    ctx.moveTo(cx+IV[4].x,cy+IV[4].y); ctx.lineTo(cx+IV[5].x,cy+IV[5].y);
    ctx.lineTo(cx+IV[0].x,cy+IV[0].y); ctx.lineTo(cx+IV[1].x,cy+IV[1].y);
    ctx.strokeStyle='rgba(80,140,220,0.13)'; ctx.lineWidth=GAP*2; ctx.stroke();
    ctx.restore();
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
  document.getElementById('wallet-balance').textContent = balance.toFixed(4) + ' SOL';
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

  document.getElementById('account-name').textContent  = account.name || 'Player';
  document.getElementById('account-email').textContent = account.email || '';
  document.getElementById('stat-highscore').textContent = account.highScore  || 0;
  document.getElementById('stat-games').textContent     = account.gamesPlayed || 0;
  document.getElementById('player-name').value = account.name || 'Player';
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
  document.getElementById('account-name').textContent = account.name;
  document.getElementById('player-name').value = account.name;
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
let walletInfo = null; // { escrowAddress, network }

fetch('/wallet/info').then(r => r.json()).then(info => { walletInfo = info; });

function walletStatus(msg, isError) {
  const el = document.getElementById('wallet-status');
  if (el) { el.textContent = msg; el.style.color = isError ? '#ff6666' : '#14F195'; }
}

function refreshGameBalance() {
  fetch('/auth/me').then(r => r.json()).then(({ account: acc }) => {
    if (acc) document.getElementById('game-balance').textContent =
      (acc.balance || 0).toFixed(4) + ' SOL';
  });
}
refreshGameBalance();

// ─── Add Funds (Receive) ──────────────────────────────────────────────────────
document.getElementById('btn-add-funds').addEventListener('click', () => {
  if (!walletInfo) { walletStatus('Loading...'); return; }
  const addr = walletInfo.escrowAddress;
  const short = addr.slice(0, 6) + '...' + addr.slice(-4);
  document.getElementById('receive-address-short').textContent = short;

  // Generate QR code (clear previous first)
  const qrEl = document.getElementById('receive-qr');
  qrEl.innerHTML = '';
  new QRCode(qrEl, {
    text: addr,
    width: 200,
    height: 200,
    colorDark: '#ffffff',
    colorLight: '#141828',
    correctLevel: QRCode.CorrectLevel.M,
  });

  document.getElementById('deposit-status').textContent = '';
  document.getElementById('confirm-wallet-address').value = '';
  document.getElementById('confirm-tx-sig').value = '';
  document.getElementById('modal-receive').classList.add('active');
});

document.getElementById('close-receive').addEventListener('click', () => {
  document.getElementById('modal-receive').classList.remove('active');
});

// Copy address to clipboard
document.getElementById('btn-copy-address').addEventListener('click', () => {
  if (!walletInfo) return;
  navigator.clipboard.writeText(walletInfo.escrowAddress).then(() => {
    const btn = document.getElementById('btn-copy-address');
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
  });
});

// Confirm deposit after sending from Phantom
document.getElementById('btn-confirm-deposit').addEventListener('click', async () => {
  const walletAddress = document.getElementById('confirm-wallet-address').value.trim();
  const signature    = document.getElementById('confirm-tx-sig').value.trim();
  const statusEl     = document.getElementById('deposit-status');

  if (!walletAddress || !signature) {
    statusEl.style.color = '#ff6666';
    statusEl.textContent = 'Enter your wallet address and transaction signature.';
    return;
  }
  statusEl.style.color = '#aaa';
  statusEl.textContent = 'Verifying transaction...';

  try {
    const res = await fetch('/wallet/deposit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signature, walletAddress }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    document.getElementById('game-balance').textContent = data.balance.toFixed(4) + ' SOL';
    statusEl.style.color = '#14F195';
    statusEl.textContent = `Deposited ${data.amount.toFixed(4)} SOL ✓`;
    document.getElementById('confirm-wallet-address').value = '';
    document.getElementById('confirm-tx-sig').value = '';
  } catch (e) {
    statusEl.style.color = '#ff6666';
    statusEl.textContent = 'Error: ' + (e.message || e);
  }
});

// ─── Withdraw ─────────────────────────────────────────────────────────────────
document.getElementById('btn-withdraw').addEventListener('click', () =>
  document.getElementById('modal-withdraw').classList.add('active'));
document.getElementById('cancel-withdraw').addEventListener('click', () =>
  document.getElementById('modal-withdraw').classList.remove('active'));
document.getElementById('confirm-withdraw').addEventListener('click', async () => {
  const walletAddress = document.getElementById('withdraw-wallet').value.trim();
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  if (!walletAddress) { alert('Enter your Solana wallet address.'); return; }
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
    document.getElementById('game-balance').textContent = data.balance.toFixed(4) + ' SOL';
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
  sessionStorage.setItem('walletAddress', walletAddress || '');
  sessionStorage.setItem('googleId',      account?.googleId || '');
  window.location.href = '/game.html';
});
