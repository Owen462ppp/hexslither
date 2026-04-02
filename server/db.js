const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      google_id      TEXT PRIMARY KEY,
      email          TEXT,
      name           TEXT,
      avatar         TEXT,
      balance        NUMERIC(18,9) DEFAULT 0,
      high_score     INTEGER DEFAULT 0,
      games_played   INTEGER DEFAULT 0,
      wallet_address TEXT,
      created_at     TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS deposits (
      id          SERIAL PRIMARY KEY,
      google_id   TEXT NOT NULL,
      tx_sig      TEXT UNIQUE NOT NULL,
      amount      NUMERIC(18,9) NOT NULL,
      from_address TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS withdrawals (
      id          SERIAL PRIMARY KEY,
      google_id   TEXT NOT NULL,
      tx_sig      TEXT,
      amount      NUMERIC(18,9) NOT NULL,
      to_address  TEXT,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  console.log('[DB] Tables ready');
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

async function getOrCreateAccount({ googleId, email, name, avatar }) {
  const res = await pool.query(
    `INSERT INTO accounts (google_id, email, name, avatar)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (google_id) DO UPDATE SET name = $3, avatar = $4
     RETURNING *`,
    [googleId, email, name, avatar]
  );
  return dbToAccount(res.rows[0]);
}

async function getAccountByGoogleId(googleId) {
  const res = await pool.query('SELECT * FROM accounts WHERE google_id = $1', [googleId]);
  return res.rows[0] ? dbToAccount(res.rows[0]) : null;
}

async function getAccountByWallet(walletAddress) {
  const res = await pool.query('SELECT * FROM accounts WHERE wallet_address = $1', [walletAddress]);
  return res.rows[0] ? dbToAccount(res.rows[0]) : null;
}

async function saveAccount(googleId, updates) {
  const fields = [];
  const values = [];
  let i = 1;
  if (updates.name          !== undefined) { fields.push(`name = $${i++}`);           values.push(updates.name); }
  if (updates.balance       !== undefined) { fields.push(`balance = $${i++}`);        values.push(updates.balance); }
  if (updates.highScore     !== undefined) { fields.push(`high_score = $${i++}`);     values.push(updates.highScore); }
  if (updates.gamesPlayed   !== undefined) { fields.push(`games_played = $${i++}`);   values.push(updates.gamesPlayed); }
  if (updates.walletAddress !== undefined) { fields.push(`wallet_address = $${i++}`); values.push(updates.walletAddress); }
  if (!fields.length) return getAccountByGoogleId(googleId);
  values.push(googleId);
  const res = await pool.query(
    `UPDATE accounts SET ${fields.join(', ')} WHERE google_id = $${i} RETURNING *`,
    values
  );
  return res.rows[0] ? dbToAccount(res.rows[0]) : null;
}

async function recordGameResult(googleId, score) {
  await pool.query(
    `UPDATE accounts SET
       games_played = games_played + 1,
       high_score   = GREATEST(high_score, $2)
     WHERE google_id = $1`,
    [googleId, score]
  );
}

// ─── Deposits ─────────────────────────────────────────────────────────────────

async function isTxUsed(txSig) {
  const res = await pool.query('SELECT 1 FROM deposits WHERE tx_sig = $1', [txSig]);
  return res.rows.length > 0;
}

async function recordDeposit(googleId, txSig, amount, fromAddress) {
  await pool.query(
    `INSERT INTO deposits (google_id, tx_sig, amount, from_address)
     VALUES ($1, $2, $3, $4) ON CONFLICT (tx_sig) DO NOTHING`,
    [googleId, txSig, amount, fromAddress]
  );
  const res = await pool.query(
    `UPDATE accounts SET balance = balance + $2, wallet_address = COALESCE(wallet_address, $3)
     WHERE google_id = $1 RETURNING balance`,
    [googleId, amount, fromAddress]
  );
  return parseFloat(res.rows[0].balance);
}

// ─── Withdrawals ──────────────────────────────────────────────────────────────

async function recordWithdrawal(googleId, txSig, amount, toAddress) {
  await pool.query(
    `INSERT INTO withdrawals (google_id, tx_sig, amount, to_address) VALUES ($1, $2, $3, $4)`,
    [googleId, txSig, amount, toAddress]
  );
  const res = await pool.query(
    `UPDATE accounts SET balance = balance - $2 WHERE google_id = $1 RETURNING balance`,
    [googleId, amount]
  );
  return parseFloat(res.rows[0].balance);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dbToAccount(row) {
  return {
    googleId:     row.google_id,
    email:        row.email,
    name:         row.name,
    avatar:       row.avatar,
    balance:      parseFloat(row.balance || 0),
    highScore:    parseInt(row.high_score || 0),
    gamesPlayed:  parseInt(row.games_played || 0),
    walletAddress: row.wallet_address,
  };
}

module.exports = {
  init, pool,
  getOrCreateAccount, getAccountByGoogleId, getAccountByWallet,
  saveAccount, recordGameResult,
  isTxUsed, recordDeposit, recordWithdrawal,
};
