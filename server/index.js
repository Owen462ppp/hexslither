const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const session    = require('express-session');
const passport   = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const C      = require('../shared/constants');
const GameRoom = require('./GameRoom');
const Auth   = require('./Auth');
const Wallet = require('./Wallet');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

// ─── Session & Passport ───────────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'hexslither-dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 }, // 7 days
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new GoogleStrategy({
  clientID:     process.env.GOOGLE_CLIENT_ID     || 'PLACEHOLDER',
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'PLACEHOLDER',
  callbackURL:  process.env.GOOGLE_CALLBACK_URL  || 'http://localhost:3000/auth/google/callback',
}, (accessToken, refreshToken, profile, done) => {
  const account = Auth.getOrCreateAccount({
    googleId: profile.id,
    email:    profile.emails?.[0]?.value || '',
    name:     profile.displayName || 'Player',
    avatar:   profile.photos?.[0]?.value || '',
  });
  done(null, account);
}));

passport.serializeUser((user, done)   => done(null, user.googleId));
passport.deserializeUser((id, done)   => done(null, Auth.getAccountByGoogleId(id) || false));

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

// Current user endpoint — lobby JS calls this on load
app.get('/auth/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ loggedIn: true, account: req.user });
  } else {
    res.json({ loggedIn: false });
  }
});

// Update display name
app.use(express.json());
app.post('/auth/update-name', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });
  const name = (req.body.name || '').slice(0, 20).trim();
  if (!name) return res.status(400).json({ error: 'Invalid name' });
  const acc = Auth.saveAccount(req.user.googleId, { name });
  res.json({ account: acc });
});

// ─── Wallet API ───────────────────────────────────────────────────────────────

// Return escrow address and network so client knows where to send SOL
app.get('/wallet/info', (req, res) => {
  res.json({
    escrowAddress: Wallet.getEscrowPublicKey(),
    network: Wallet.NETWORK,
  });
});

// Confirm deposit: server finds the most recent tx from user's wallet to escrow
app.post('/wallet/deposit', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });
  const { walletAddress } = req.body;
  if (!walletAddress) return res.status(400).json({ error: 'Missing wallet address' });
  try {
    const amount = await Wallet.verifyDeposit(walletAddress);
    const acc = Auth.getAccountByGoogleId(req.user.googleId);
    if (!acc) return res.status(404).json({ error: 'Account not found' });
    acc.balance = (acc.balance || 0) + amount;
    acc.walletAddress = walletAddress;
    res.json({ ok: true, amount, balance: acc.balance });
  } catch (e) {
    console.error('[WALLET] Deposit error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

// Withdraw: send SOL from escrow back to user wallet
app.post('/wallet/withdraw', async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not logged in' });
  const { amount, walletAddress } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
  const acc = Auth.getAccountByGoogleId(req.user.googleId);
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  const toAddress = walletAddress || acc.walletAddress;
  if (!toAddress) return res.status(400).json({ error: 'No wallet address provided' });
  if ((acc.balance || 0) < amount) return res.status(400).json({ error: 'Insufficient balance' });
  try {
    const sig = await Wallet.withdraw(toAddress, amount);
    acc.balance = (acc.balance || 0) - amount;
    if (walletAddress) acc.walletAddress = walletAddress;
    res.json({ ok: true, signature: sig, balance: acc.balance });
  } catch (e) {
    console.error('[WALLET] Withdraw error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

// ─── Static files ─────────────────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  next();
});
app.use(express.static(path.join(__dirname, '../public')));
app.use('/shared', express.static(path.join(__dirname, '../shared')));

// ─── Game ─────────────────────────────────────────────────────────────────────
const gameRoom = new GameRoom(io);
gameRoom.start();

const walletLedger = new Map();

io.on('connection', (socket) => {
  console.log(`[+] Connected: ${socket.id}`);

  socket.emit(C.EVENTS.LOBBY_STATE, {
    playerCount: gameRoom.playerCount,
    leaderboard: gameRoom.buildLeaderboard(),
  });

  socket.on(C.EVENTS.PLAY, ({ name, walletAddress, googleId } = {}) => {
    const playerName = (name || 'Player').slice(0, 20);
    if (googleId) socket._googleId = googleId;
    console.log(`[>] ${playerName} joins game`);
    gameRoom.addPlayer(socket, playerName, walletAddress || null);
  });

  socket.on(C.EVENTS.INPUT, ({ angle, boost }) => {
    if (typeof angle !== 'number') return;
    gameRoom.handleInput(socket.id, angle, !!boost);
  });

  socket.on(C.EVENTS.RESPAWN, () => {
    gameRoom.respawnPlayer(socket.id);
  });

  socket.on(C.EVENTS.WALLET_CONNECT, ({ walletAddress }) => {
    if (!walletAddress) return;
    const balance = walletLedger.get(walletAddress) || 0;
    socket.emit(C.EVENTS.WALLET_BALANCE, { balance, walletAddress });
  });

  socket.on(C.EVENTS.WALLET_DEPOSIT, ({ walletAddress, amount }) => {
    if (!walletAddress || !amount || amount <= 0) return;
    const current = walletLedger.get(walletAddress) || 0;
    walletLedger.set(walletAddress, current + amount);
    socket.emit(C.EVENTS.WALLET_BALANCE, { balance: walletLedger.get(walletAddress), walletAddress });
  });

  socket.on(C.EVENTS.WALLET_WITHDRAW, ({ walletAddress, amount }) => {
    if (!walletAddress || !amount || amount <= 0) return;
    const current = walletLedger.get(walletAddress) || 0;
    if (amount > current) {
      socket.emit(C.EVENTS.ERROR, { code: 'INSUFFICIENT_FUNDS', message: 'Insufficient balance' });
      return;
    }
    walletLedger.set(walletAddress, current - amount);
    socket.emit(C.EVENTS.WALLET_BALANCE, { balance: walletLedger.get(walletAddress), walletAddress });
  });

  socket.on('disconnect', () => {
    console.log(`[-] Disconnected: ${socket.id}`);
    const snake = gameRoom.snakes && gameRoom.snakes.get(socket.id);
    if (snake && socket._googleId) {
      Auth.recordGameResult(socket._googleId, snake.score);
    }
    gameRoom.removePlayer(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
