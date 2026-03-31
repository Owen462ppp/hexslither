const nodemailer = require('nodemailer');

// In-memory stores (persist to a DB in production)
const accounts = new Map();   // email -> { name, walletAddress, highScore, gamesPlayed, createdAt }
const pending  = new Map();   // email -> { code, expiresAt }

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createTransport() {
  // Uses env vars set in Render dashboard (or .env locally)
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendCode(email) {
  email = email.toLowerCase().trim();
  if (!email.includes('@')) throw new Error('Invalid email');

  const code = generateCode();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes
  pending.set(email, { code, expiresAt });

  const isExisting = accounts.has(email);

  // Only send real email if SMTP credentials are configured
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    const transport = createTransport();
    await transport.sendMail({
      from: `"HexSlither" <${process.env.SMTP_USER}>`,
      to: email,
      subject: 'Your HexSlither login code',
      html: `
        <div style="font-family:sans-serif;background:#03080f;color:#fff;padding:32px;border-radius:12px;max-width:400px">
          <h2 style="color:#ff8800;margin:0 0 8px">HexSlither</h2>
          <p style="color:#aaa;margin:0 0 24px">Your login code:</p>
          <div style="font-size:42px;font-weight:900;letter-spacing:12px;color:#fff;background:#0b1929;padding:20px;border-radius:8px;text-align:center">
            ${code}
          </div>
          <p style="color:#555;font-size:12px;margin:16px 0 0">
            This code expires in 10 minutes. If you didn't request this, ignore it.
          </p>
        </div>
      `,
    });
  } else {
    // Dev mode: print code to server console
    console.log(`[AUTH] Code for ${email}: ${code}`);
  }

  return { isExisting };
}

function verifyCode(email, code) {
  email = email.toLowerCase().trim();
  const entry = pending.get(email);
  if (!entry) return { ok: false, reason: 'No code requested' };
  if (Date.now() > entry.expiresAt) {
    pending.delete(email);
    return { ok: false, reason: 'Code expired' };
  }
  if (entry.code !== String(code).trim()) {
    return { ok: false, reason: 'Wrong code' };
  }
  pending.delete(email);

  // Create account if new
  if (!accounts.has(email)) {
    accounts.set(email, {
      email,
      name: email.split('@')[0],
      walletAddress: null,
      highScore: 0,
      gamesPlayed: 0,
      createdAt: Date.now(),
    });
  }
  return { ok: true, account: accounts.get(email) };
}

function getAccount(email) {
  return accounts.get(email.toLowerCase().trim()) || null;
}

function saveAccount(email, updates) {
  email = email.toLowerCase().trim();
  const acc = accounts.get(email);
  if (!acc) return null;
  Object.assign(acc, updates);
  return acc;
}

function recordGameResult(email, score) {
  const acc = getAccount(email);
  if (!acc) return;
  acc.gamesPlayed++;
  if (score > acc.highScore) acc.highScore = score;
}

module.exports = { sendCode, verifyCode, getAccount, saveAccount, recordGameResult };
