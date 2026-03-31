// Lobby background hex animation
(function() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  const HEX_R = 35;
  function drawHex(cx, cy, t) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 - Math.PI / 6;
      const x = cx + HEX_R * Math.cos(a);
      const y = cy + HEX_R * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    const pulse = (Math.sin(t + cx * 0.01 + cy * 0.01) + 1) / 2;
    ctx.strokeStyle = `rgba(255,100,0,${0.15 + pulse * 0.25})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  let t = 0;
  function animate() {
    ctx.clearRect(0, 0, W, H);
    t += 0.008;
    const colSpacing = HEX_R * 1.5;
    const rowSpacing = HEX_R * Math.sqrt(3);
    const cols = Math.ceil(W / colSpacing) + 2;
    const rows = Math.ceil(H / rowSpacing) + 2;
    for (let c = -1; c < cols; c++) {
      for (let r = -1; r < rows; r++) {
        const x = c * colSpacing * 2;
        const y = r * rowSpacing + (c % 2) * rowSpacing / 2;
        drawHex(x, y, t);
      }
    }
    requestAnimationFrame(animate);
  }
  animate();
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
