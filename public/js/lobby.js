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
    ctx.fillStyle = '#03080f'; ctx.fillRect(0,0,W,H);
    const cols = Math.ceil(W/COL_STEP)+3, rows = Math.ceil(H/ROW_STEP)+3;
    for (let col=-1; col<cols; col++)
      for (let row=-1; row<rows; row++) {
        const cx = col*COL_STEP, cy = row*ROW_STEP + (col%2===0?0:ROW_STEP/2);
        drawHex(cx,cy);
      }
  }
  draw();
  window.addEventListener('resize', draw);
})();

// ─── App state ────────────────────────────────────────────────────────────────
const socket = io();
let account = null;       // current logged-in account object
let walletAddress = null;

// Restore session from localStorage
const savedEmail = localStorage.getItem('hs_email');
const savedAccount = localStorage.getItem('hs_account');
if (savedEmail && savedAccount) {
  try {
    account = JSON.parse(savedAccount);
    showLobby();
  } catch(e) { localStorage.clear(); }
}

// ─── Socket events ─────────────────────────────────────────────────────────────
socket.on(CONSTANTS.EVENTS.LOBBY_STATE, ({ playerCount, leaderboard }) => {
  const el = document.getElementById('stat-players');
  if (el) el.textContent = playerCount;
  updateLobbyLeaderboard(leaderboard);
});

socket.on('auth_code_sent', ({ email, isExisting }) => {
  document.getElementById('step-email').classList.add('hidden');
  document.getElementById('step-code').classList.remove('hidden');
  document.getElementById('code-sent-to').textContent =
    `Code sent to ${email} — check your inbox (also spam)`;
  document.getElementById('login-code').focus();
});

socket.on('auth_success', ({ account: acc }) => {
  account = acc;
  localStorage.setItem('hs_email', acc.email);
  localStorage.setItem('hs_account', JSON.stringify(acc));
  showLobby();
});

socket.on('auth_failed', ({ reason }) => {
  alert('Login failed: ' + reason);
  document.getElementById('login-code').value = '';
  document.getElementById('login-code').focus();
});

socket.on('auth_account_updated', ({ account: acc }) => {
  account = acc;
  localStorage.setItem('hs_account', JSON.stringify(acc));
  refreshAccountUI();
});

socket.on(CONSTANTS.EVENTS.WALLET_BALANCE, ({ balance }) => {
  document.getElementById('wallet-balance').textContent = balance.toFixed(4) + ' SOL';
});

socket.on(CONSTANTS.EVENTS.ERROR, ({ message }) => alert('Error: ' + message));

// ─── Auth UI ──────────────────────────────────────────────────────────────────
document.getElementById('btn-send-code').addEventListener('click', () => {
  const email = document.getElementById('login-email').value.trim();
  if (!email || !email.includes('@')) { alert('Enter a valid email'); return; }
  document.getElementById('btn-send-code').textContent = 'Sending...';
  document.getElementById('btn-send-code').disabled = true;
  socket.emit('auth_request_code', { email });
  setTimeout(() => {
    document.getElementById('btn-send-code').textContent = 'Send Code';
    document.getElementById('btn-send-code').disabled = false;
  }, 4000);
});

document.getElementById('login-email').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-send-code').click();
});

document.getElementById('btn-verify-code').addEventListener('click', () => {
  const email = document.getElementById('login-email').value.trim();
  const code  = document.getElementById('login-code').value.trim();
  if (!code || code.length < 6) { alert('Enter the 6-digit code'); return; }
  socket.emit('auth_verify_code', { email, code });
});

document.getElementById('login-code').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-verify-code').click();
});

document.getElementById('btn-back-email').addEventListener('click', () => {
  document.getElementById('step-code').classList.add('hidden');
  document.getElementById('step-email').classList.remove('hidden');
  document.getElementById('login-code').value = '';
});

// ─── Lobby UI ─────────────────────────────────────────────────────────────────
function showLobby() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('lobby-screen').classList.remove('hidden');
  refreshAccountUI();
}

function refreshAccountUI() {
  if (!account) return;
  const initial = (account.name || account.email)[0].toUpperCase();
  document.getElementById('account-avatar').textContent = initial;
  document.getElementById('account-name').textContent   = account.name || account.email.split('@')[0];
  document.getElementById('account-email').textContent  = account.email;
  document.getElementById('stat-highscore').textContent = account.highScore || 0;
  document.getElementById('stat-games').textContent     = account.gamesPlayed || 0;
  document.getElementById('player-name').value = account.name || account.email.split('@')[0];
}

document.getElementById('btn-signout').addEventListener('click', () => {
  account = null;
  localStorage.removeItem('hs_email');
  localStorage.removeItem('hs_account');
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('step-code').classList.add('hidden');
  document.getElementById('step-email').classList.remove('hidden');
  document.getElementById('login-email').value = '';
  document.getElementById('login-code').value = '';
});

// Edit name
document.getElementById('btn-edit-name').addEventListener('click', () => {
  document.getElementById('editname-input').value = account.name || '';
  document.getElementById('modal-editname').classList.add('active');
});
document.getElementById('cancel-editname').addEventListener('click', () => {
  document.getElementById('modal-editname').classList.remove('active');
});
document.getElementById('confirm-editname').addEventListener('click', () => {
  const name = document.getElementById('editname-input').value.trim();
  if (!name) return;
  socket.emit('auth_update_name', { email: account.email, name });
  document.getElementById('player-name').value = name;
  document.getElementById('modal-editname').classList.remove('active');
});

// Leaderboard
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

// ─── Phantom Wallet ───────────────────────────────────────────────────────────
document.getElementById('btn-wallet').addEventListener('click', async () => {
  const phantom = window.solana;
  if (!phantom || !phantom.isPhantom) {
    alert('Phantom Wallet not found!\nInstall it at phantom.app');
    return;
  }
  try {
    const resp = await phantom.connect();
    walletAddress = resp.publicKey.toString();
    document.getElementById('wallet-address').textContent = walletAddress;
    document.getElementById('wallet-info').classList.add('active');
    document.getElementById('btn-wallet').textContent = 'Wallet Connected';
    document.getElementById('btn-wallet').style.opacity = '0.6';
    socket.emit(CONSTANTS.EVENTS.WALLET_CONNECT, { walletAddress });
  } catch (e) { alert('Wallet connect failed: ' + (e.message || e)); }
});

document.getElementById('btn-deposit').addEventListener('click', () =>
  document.getElementById('modal-deposit').classList.add('active'));
document.getElementById('cancel-deposit').addEventListener('click', () =>
  document.getElementById('modal-deposit').classList.remove('active'));
document.getElementById('confirm-deposit').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('deposit-amount').value);
  if (!amount || amount <= 0) return;
  socket.emit(CONSTANTS.EVENTS.WALLET_DEPOSIT, { walletAddress, amount });
  document.getElementById('modal-deposit').classList.remove('active');
  document.getElementById('deposit-amount').value = '';
});

document.getElementById('btn-withdraw').addEventListener('click', () =>
  document.getElementById('modal-withdraw').classList.add('active'));
document.getElementById('cancel-withdraw').addEventListener('click', () =>
  document.getElementById('modal-withdraw').classList.remove('active'));
document.getElementById('confirm-withdraw').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  if (!amount || amount <= 0) return;
  socket.emit(CONSTANTS.EVENTS.WALLET_WITHDRAW, { walletAddress, amount });
  document.getElementById('modal-withdraw').classList.remove('active');
  document.getElementById('withdraw-amount').value = '';
});

// ─── Play button ──────────────────────────────────────────────────────────────
document.getElementById('btn-play').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim() || account?.name || 'Player';
  sessionStorage.setItem('playerName', name);
  sessionStorage.setItem('walletAddress', walletAddress || '');
  sessionStorage.setItem('playerEmail', account?.email || '');
  window.location.href = '/game.html';
});
