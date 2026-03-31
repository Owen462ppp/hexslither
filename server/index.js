const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const C = require('../shared/constants');
const GameRoom = require('./GameRoom');

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
  socket.on(C.EVENTS.PLAY, ({ name, walletAddress } = {}) => {
    const playerName = (name || 'Player').slice(0, 20);
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

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    gameRoom.removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
