const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const C = require('../shared/constants');
const GameRoom = require('./GameRoom');
const Auth = require('./Auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
});

// No-cache headers so browser always loads latest JS/CSS
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, '../public')));
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// Single global game room for simplicity
const gameRoom = new GameRoom(io);
gameRoom.start();

// In-memory wallet ledger: walletAddress -> balance (in SOL/tokens)
const walletLedger = new Map();

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  // Lobby state on connect
  socket.emit(C.EVENTS.LOBBY_STATE, {
    playerCount: gameRoom.playerCount,
    leaderboard: gameRoom.buildLeaderboard(),
  });

  // Player clicks Play
  socket.on(C.EVENTS.PLAY, ({ name, walletAddress, email } = {}) => {
    const playerName = (name || 'Player').slice(0, 20);
    if (email) socket._authEmail = email;
    console.log(`[>] ${playerName} joins game`);
    gameRoom.addPlayer(socket, playerName, walletAddress || null);
  });

  // Player sends input
  socket.on(C.EVENTS.INPUT, ({ angle, boost }) => {
    if (typeof angle !== 'number') return;
    gameRoom.handleInput(socket.id, angle, !!boost);
  });

  // Player respawns
  socket.on(C.EVENTS.RESPAWN, () => {
    gameRoom.respawnPlayer(socket.id);
  });

  // Wallet: connect / verify address
  socket.on(C.EVENTS.WALLET_CONNECT, ({ walletAddress }) => {
    if (!walletAddress) return;
    const balance = walletLedger.get(walletAddress) || 0;
    socket.emit(C.EVENTS.WALLET_BALANCE, { balance, walletAddress });
  });

  // Wallet: deposit (simulated - in production verify on-chain tx)
  socket.on(C.EVENTS.WALLET_DEPOSIT, ({ walletAddress, amount }) => {
    if (!walletAddress || !amount || amount <= 0) return;
    const current = walletLedger.get(walletAddress) || 0;
    walletLedger.set(walletAddress, current + amount);
    socket.emit(C.EVENTS.WALLET_BALANCE, {
      balance: walletLedger.get(walletAddress),
      walletAddress,
    });
  });

  // Wallet: withdraw (simulated)
  socket.on(C.EVENTS.WALLET_WITHDRAW, ({ walletAddress, amount }) => {
    if (!walletAddress || !amount || amount <= 0) return;
    const current = walletLedger.get(walletAddress) || 0;
    if (amount > current) {
      socket.emit(C.EVENTS.ERROR, { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance' });
      return;
    }
    walletLedger.set(walletAddress, current - amount);
    socket.emit(C.EVENTS.WALLET_BALANCE, {
      balance: walletLedger.get(walletAddress),
      walletAddress,
    });
  });

  // Auth: request login code
  socket.on('auth_request_code', async ({ email }) => {
    console.log(`[AUTH] Code requested for: ${email}`);
    console.log(`[AUTH] SMTP_USER set: ${!!process.env.SMTP_USER}, SMTP_PASS set: ${!!process.env.SMTP_PASS}`);
    try {
      const { isExisting } = await Auth.sendCode(email);
      console.log(`[AUTH] Code sent successfully to: ${email}`);
      socket.emit('auth_code_sent', { email, isExisting });
    } catch (e) {
      console.error(`[AUTH] Failed to send code to ${email}:`, e.message);
      socket.emit('auth_failed', { reason: 'Failed to send email: ' + e.message });
    }
  });

  // Auth: verify code
  socket.on('auth_verify_code', ({ email, code }) => {
    const result = Auth.verifyCode(email, code);
    if (result.ok) {
      socket.emit('auth_success', { account: result.account });
    } else {
      socket.emit('auth_failed', { reason: result.reason });
    }
  });

  // Auth: update display name
  socket.on('auth_update_name', ({ email, name }) => {
    const acc = Auth.saveAccount(email, { name: name.slice(0, 20) });
    if (acc) socket.emit('auth_account_updated', { account: acc });
  });

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    // Record game result if player was in game
    const snake = gameRoom.snakes && gameRoom.snakes.get(socket.id);
    if (snake && socket._authEmail) {
      Auth.recordGameResult(socket._authEmail, snake.score);
    }
    gameRoom.removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
