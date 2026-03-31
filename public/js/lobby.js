// Lobby background — static 3D hex tiles matching the reference image
(function() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H;
  const HEX_R = 38;
  const gap = 2;
  const drawR = HEX_R - gap;

  function hexVerts(r) {
    const v = [];
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      v.push({ x: r * Math.cos(a), y: r * Math.sin(a) });
    }
    return v;
  }
  const verts = hexVerts(drawR);

  function hexPath(cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx + verts[0].x, cy + verts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(cx + verts[i].x, cy + verts[i].y);
    ctx.closePath();
  }

  function drawHex(cx, cy) {
    // Base fill
    hexPath(cx, cy);
    ctx.fillStyle = '#0d1e35';
    ctx.fill();

    // Radial depth gradient
    const grad = ctx.createRadialGradient(
      cx - drawR * 0.25, cy - drawR * 0.25, 0,
      cx, cy, drawR * 1.1
    );
    grad.addColorStop(0,   'rgba(30,60,100,0.2)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0)');
    grad.addColorStop(1,   'rgba(0,0,0,0.5)');
    hexPath(cx, cy);
    ctx.fillStyle = grad;
    ctx.fill();

    // Top-left highlight edges
    ctx.beginPath();
    ctx.moveTo(cx + verts[4].x, cy + verts[4].y);
    ctx.lineTo(cx + verts[5].x, cy + verts[5].y);
    ctx.lineTo(cx + verts[0].x, cy + verts[0].y);
    ctx.lineTo(cx + verts[1].x, cy + verts[1].y);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Bottom-right shadow edges
    ctx.beginPath();
    ctx.moveTo(cx + verts[1].x, cy + verts[1].y);
    ctx.lineTo(cx + verts[2].x, cy + verts[2].y);
    ctx.lineTo(cx + verts[3].x, cy + verts[3].y);
    ctx.lineTo(cx + verts[4].x, cy + verts[4].y);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Gap stroke (dark separator between tiles)
    hexPath(cx, cy);
    ctx.strokeStyle = '#07101e';
    ctx.lineWidth = gap * 2;
    ctx.stroke();
  }

  function draw() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;

    ctx.fillStyle = '#07101e';
    ctx.fillRect(0, 0, W, H);

    const colSpacing = HEX_R * 3;
    const rowSpacing = HEX_R * Math.sqrt(3);
    const cols = Math.ceil(W / colSpacing) + 2;
    const rows = Math.ceil(H / rowSpacing) + 2;

    for (let c = -1; c < cols; c++) {
      for (let r = -1; r < rows; r++) {
        const cx = c * colSpacing;
        const cy = r * rowSpacing + (c % 2) * rowSpacing / 2;
        drawHex(cx, cy);
      }
    }
  }

  draw();
  window.addEventListener('resize', draw);
})();

// Socket
const socket = io();
let walletAddress = null;
let walletBalance = 0;

// Lobby state updates
socket.on(CONSTANTS.EVENTS.LOBBY_STATE, ({ playerCount, leaderboard }) => {
  document.getElementById('stat-players').textContent = playerCount;
  updateLobbyLeaderboard(leaderboard);
});

socket.on(CONSTANTS.EVENTS.WALLET_BALANCE, ({ balance, walletAddress: addr }) => {
  walletBalance = balance;
  document.getElementById('wallet-balance').textContent = balance.toFixed(4) + ' SOL';
});

function updateLobbyLeaderboard(lb) {
  const el = document.getElementById('lobby-leaderboard');
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

// Phantom wallet
const btnWallet = document.getElementById('btn-wallet');
const walletInfo = document.getElementById('wallet-info');

btnWallet.addEventListener('click', async () => {
  const phantom = window.solana;
  if (!phantom || !phantom.isPhantom) {
    alert('Phantom Wallet not found!\n\nPlease install the Phantom browser extension at phantom.app');
    return;
  }
  try {
    const resp = await phantom.connect();
    walletAddress = resp.publicKey.toString();
    document.getElementById('wallet-address').textContent = walletAddress;
    walletInfo.classList.add('active');
    btnWallet.textContent = 'Wallet Connected';
    btnWallet.style.opacity = '0.6';
    btnWallet.style.cursor = 'default';
    socket.emit(CONSTANTS.EVENTS.WALLET_CONNECT, { walletAddress });
  } catch (e) {
    console.error('Wallet connect failed:', e);
    alert('Failed to connect wallet: ' + (e.message || e));
  }
});

// Deposit / Withdraw modals
document.getElementById('btn-deposit').addEventListener('click', () => {
  document.getElementById('modal-deposit').classList.add('active');
});
document.getElementById('cancel-deposit').addEventListener('click', () => {
  document.getElementById('modal-deposit').classList.remove('active');
});
document.getElementById('confirm-deposit').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('deposit-amount').value);
  if (!amount || amount <= 0) return;
  socket.emit(CONSTANTS.EVENTS.WALLET_DEPOSIT, { walletAddress, amount });
  document.getElementById('modal-deposit').classList.remove('active');
  document.getElementById('deposit-amount').value = '';
});

document.getElementById('btn-withdraw').addEventListener('click', () => {
  document.getElementById('modal-withdraw').classList.add('active');
});
document.getElementById('cancel-withdraw').addEventListener('click', () => {
  document.getElementById('modal-withdraw').classList.remove('active');
});
document.getElementById('confirm-withdraw').addEventListener('click', () => {
  const amount = parseFloat(document.getElementById('withdraw-amount').value);
  if (!amount || amount <= 0) return;
  socket.emit(CONSTANTS.EVENTS.WALLET_WITHDRAW, { walletAddress, amount });
  document.getElementById('modal-withdraw').classList.remove('active');
  document.getElementById('withdraw-amount').value = '';
});

socket.on(CONSTANTS.EVENTS.ERROR, ({ message }) => {
  alert('Error: ' + message);
});

// Play button
document.getElementById('btn-play').addEventListener('click', () => {
  const name = document.getElementById('player-name').value.trim() || 'Player';
  // Store in sessionStorage so game.js can read it
  sessionStorage.setItem('playerName', name);
  sessionStorage.setItem('walletAddress', walletAddress || '');
  window.location.href = '/game.html';
});

// Enter to play
document.getElementById('player-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-play').click();
});
