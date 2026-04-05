const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const session    = require('express-session');
const passport   = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const C      = require('../shared/constants');
const GameRoom = require('./GameRoom');
const db     = require('./db');
const Wallet = require('./Wallet');

Wallet.setDb(db);

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ─── Init DB then start server ────────────────────────────────────────────────
db.init().catch(e => console.error('[DB] Init failed:', e.message));

// ─── Session & Passport ───────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'hexslither-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 },
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID     || 'PLACEHOLDER',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER',
  callbackURL:  process.env.GOOGLE_CALLBACK_URL  || 'http://localhost:3000/auth/google/callback',
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const account = await db.getOrCreateAccount({
      googleId: profile.id,
      email:    profile.emails?.[0]?.value || '',
      name:     profile.displayName || 'Player',
      avatar:   profile.photos?.[0]?.value || '',
    });
    done(null, account);
  } catch (e) { done(e); }
}));

passport.serializeUser((user, done) => done(null, user.googleId));
passport.deserializeUser(async (id, done) => {
  try {
    const acc = await db.getAccountByGoogleId(id);
    done(null, acc || false);
  } catch (e) { done(e); }
});

// ─── Auth routes ──────────────────────────────────────────────────────────────
app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);
app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=auth' }),
  (req, res) => res.redirect('/')
);
app.get('/auth/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});
app.get('/auth/me', (req, res) => {
  if (req.isAuthenticated()) res.json({ loggedIn: true, account: req.user });
  else res.json({ loggedIn: false });
});

app.use(express.json());

app.post('/auth/update-name', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });
  const name = (req.body.name || '').slice(0, 20).trim();
  if (!name) return res.status(400).json({ error: 'Invalid name' });
  const acc = await db.saveAccount(req.user.googleId, { name });
  req.user.name = acc.name;
  res.json({ account: acc });
});

// ─── Wallet API ───────────────────────────────────────────────────────────────

app.get('/wallet/debug', async (req, res) => {
  try {
    const sigs = await Wallet.getRecentSigs();
    res.json({ escrowPubkey: Wallet.getEscrowPublicKey(), sigs });
  } catch (e) { res.json({ error: e.message }); }
});

app.get('/wallet/info', (req, res) => {
  try {
    res.json({ escrowAddress: Wallet.getEscrowPublicKey(), network: Wallet.NETWORK });
  } catch (e) {
    res.status(500).json({ error: 'Wallet not configured on server' });
  }
});

app.post('/wallet/deposit', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });
  try {
    const result = await Wallet.findLatestDeposit();
    if (!result) return res.status(202).json({ pending: true });
    const newBalance = await db.recordDeposit(
      req.user.googleId, result.sig, result.amount, result.fromAddress
    );
    req.user.balance = newBalance;
    console.log(`[WALLET] Credited ${result.amount} SOL to ${req.user.name}`);
    res.json({ ok: true, amount: result.amount, balance: newBalance });
  } catch (e) {
    console.error('[WALLET] Deposit error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

app.post('/wallet/withdraw', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });
  const { amount, walletAddress } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (!walletAddress) return res.status(400).json({ error: 'Wallet address required' });
  const acc = await db.getAccountByGoogleId(req.user.googleId);
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  if (acc.balance < amount) return res.status(400).json({ error: 'Insufficient balance' });
  try {
    const sig = await Wallet.withdraw(walletAddress, amount);
    const newBalance = await db.recordWithdrawal(req.user.googleId, sig, amount, walletAddress);
    req.user.balance = newBalance;
    res.json({ ok: true, signature: sig, balance: newBalance });
  } catch (e) {
    console.error('[WALLET] Withdraw error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

// ─── Static files ─────────────────────────────────────────────────────────────
app.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use(express.static(path.join(__dirname, '../public')));
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// ─── Single game room (all lobby types share one room) ────────────────────────
const mainRoom = new GameRoom(io);
mainRoom.start();

function getRoomForType(t) {
  return mainRoom;
}

const lobbySocketsByGoogleId = new Map();
const lobbyConnections = new Set();

function totalInGame() {
  return mainRoom.playerCount;
}

function broadcastLobbyState() {
  const state = {
    playerCount: totalInGame(),
    lobbyCount:  lobbyConnections.size,
    leaderboard: mainRoom.buildLeaderboard(),
  };
  for (const sock of lobbyConnections) sock.emit(C.EVENTS.LOBBY_STATE, state);
}

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.emit(C.EVENTS.LOBBY_STATE, {
    playerCount: totalInGame(),
    lobbyCount:  lobbyConnections.size,
    leaderboard: mainRoom.buildLeaderboard(),
  });

  socket.on('lobby:join', ({ googleId } = {}) => {
    lobbyConnections.add(socket);
    if (googleId) {
      socket._googleId = googleId;
      lobbySocketsByGoogleId.set(googleId, socket);
    }
    broadcastLobbyState();
  });

  socket.on(C.EVENTS.PLAY, ({ name, walletAddress, googleId, color, lobbyType } = {}) => {
    const playerName = (name || 'Player').slice(0, 20);
    if (googleId) {
      socket._googleId = googleId;
      lobbySocketsByGoogleId.set(googleId, socket);
    }
    const room = getRoomForType(lobbyType);
    socket._room = room;
    console.log(`[>] ${playerName} joins ${lobbyType || 'free'} lobby`);
    room.addPlayer(socket, playerName, walletAddress || null, color || null);
    lobbyConnections.delete(socket);
    broadcastLobbyState();
  });

  socket.on(C.EVENTS.INPUT, ({ angle, boost }) => {
    if (typeof angle !== 'number') return;
    if (socket._room) socket._room.handleInput(socket.id, angle, !!boost);
  });

  socket.on(C.EVENTS.RESPAWN, () => {
    if (socket._room) socket._room.respawnPlayer(socket.id);
  });

  socket.on('admin:spawnbot', ({ count } = {}) => {
    const ownerGoogleId = process.env.OWNER_GOOGLE_ID;
    if (!ownerGoogleId || socket._googleId !== ownerGoogleId) return;
    const n = Math.min(Math.max(1, parseInt(count) || 1), 10);
    const room = socket._room || mainRoom;
    for (let i = 0; i < n; i++) room.addBot();
    socket.emit('admin:ack', { message: `Spawned ${n} bot(s)` });
  });

  socket.on('disconnect', async () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    const room = socket._room;
    if (room) {
      const snake = room.snakes && room.snakes.get(socket.id);
      if (snake && socket._googleId) {
        await db.recordGameResult(socket._googleId, snake.score).catch(() => {});
      }
      room.removePlayer(socket.id);
    }
    if (socket._googleId) lobbySocketsByGoogleId.delete(socket._googleId);
    lobbyConnections.delete(socket);
    broadcastLobbyState();
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
