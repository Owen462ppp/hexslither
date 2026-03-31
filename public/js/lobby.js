// Lobby background — static 3D embossed hex tiles
(function() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');

  // Pointy-top hexagons (like the reference image)
  // R = circumradius
  const R = 36;
  // Center-to-center spacing for pointy-top hex grid:
  //   horizontal (same row): sqrt(3) * R
  //   vertical (row to row): 1.5 * R
  //   odd rows offset right by: sqrt(3)/2 * R
  const COL_W = Math.sqrt(3) * R;   // horizontal spacing
  const ROW_H = R * 1.5;            // vertical spacing

  // Pointy-top vertices (angle starts at -90deg = top)
  const VERTS = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    VERTS.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
  }

  // Inner draw radius slightly smaller to create gap between tiles
  const INNER_R = R - 1.5;
  const INNER_V = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 90);
    INNER_V.push({ x: INNER_R * Math.cos(a), y: INNER_R * Math.sin(a) });
  }

  function hexPath(verts, cx, cy) {
    ctx.beginPath();
    ctx.moveTo(cx + verts[0].x, cy + verts[0].y);
    for (let i = 1; i < 6; i++) ctx.lineTo(cx + verts[i].x, cy + verts[i].y);
    ctx.closePath();
  }

  function drawHex(cx, cy) {
    // 1. Dark background fill (the gap colour)
    hexPath(VERTS, cx, cy);
    ctx.fillStyle = '#060e1a';
    ctx.fill();

    // 2. Main hex face (slightly inset)
    hexPath(INNER_V, cx, cy);
    ctx.fillStyle = '#0c1c30';
    ctx.fill();

    // 3. Radial gradient — lighter centre, darker rim (gives the raised look)
    const grad = ctx.createRadialGradient(
      cx - INNER_R * 0.2, cy - INNER_R * 0.2, 0,
      cx, cy, INNER_R
    );
    grad.addColorStop(0,   'rgba(50, 100, 160, 0.22)');
    grad.addColorStop(0.5, 'rgba(20,  50, 100, 0.08)');
    grad.addColorStop(1,   'rgba(0,    0,   0, 0.55)');
    hexPath(INNER_V, cx, cy);
    ctx.fillStyle = grad;
    ctx.fill();

    // 4. Top-left highlight edge (vertices 5→0→1)
    ctx.beginPath();
    ctx.moveTo(cx + INNER_V[5].x, cy + INNER_V[5].y);
    ctx.lineTo(cx + INNER_V[0].x, cy + INNER_V[0].y);
    ctx.lineTo(cx + INNER_V[1].x, cy + INNER_V[1].y);
    ctx.strokeStyle = 'rgba(130, 180, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 5. Bottom-right shadow edge (vertices 2→3→4)
    ctx.beginPath();
    ctx.moveTo(cx + INNER_V[2].x, cy + INNER_V[2].y);
    ctx.lineTo(cx + INNER_V[3].x, cy + INNER_V[3].y);
    ctx.lineTo(cx + INNER_V[4].x, cy + INNER_V[4].y);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function draw() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const W = canvas.width;
    const H = canvas.height;

    // Fill background with gap colour first
    ctx.fillStyle = '#060e1a';
    ctx.fillRect(0, 0, W, H);

    const cols = Math.ceil(W / COL_W) + 3;
    const rows = Math.ceil(H / ROW_H) + 3;

    for (let row = -1; row < rows; row++) {
      for (let col = -1; col < cols; col++) {
        // Odd rows are offset to the right by half a column width
        const cx = col * COL_W + (row % 2) * (COL_W / 2);
        const cy = row * ROW_H;
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
