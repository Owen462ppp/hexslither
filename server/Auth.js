const { Resend } = require('resend');

const accounts = new Map();
const pending  = new Map();

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendCode(email) {
  email = email.toLowerCase().trim();
  if (!email.includes('@')) throw new Error('Invalid email');

  const code = generateCode();
  pending.set(email, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
  const isExisting = accounts.has(email);

  if (process.env.RESEND_API_KEY) {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: 'HexSlither <onboarding@resend.dev>',
      to: email,
      subject: 'Your HexSlither login code',
      html: `
        <div style="font-family:sans-serif;background:#03080f;color:#fff;padding:32px;border-radius:12px;max-width:400px">
          <h2 style="color:#ff8800;margin:0 0 8px">HexSlither</h2>
          <p style="color:#aaa;margin:0 0 24px">Your login code:</p>
          <div style="font-size:48px;font-weight:900;letter-spacing:14px;color:#fff;background:#0b1929;padding:20px;border-radius:8px;text-align:center">
            ${code}
          </div>
          <p style="color:#555;font-size:12px;margin:16px 0 0">Expires in 10 minutes.</p>
        </div>
      `,
    });
    if (error) throw new Error(error.message);
  } else {
    // Dev fallback — print to console
    console.log(`[AUTH] Code for ${email}: ${code}`);
  }

  return { isExisting };
}

function verifyCode(email, code) {
  email = email.toLowerCase().trim();
  const entry = pending.get(email);
  if (!entry) return { ok: false, reason: 'No code was requested for this email' };
  if (Date.now() > entry.expiresAt) {
    pending.delete(email);
    return { ok: false, reason: 'Code expired, request a new one' };
  }
  if (entry.code !== String(code).trim()) {
    return { ok: false, reason: 'Incorrect code' };
  }
  pending.delete(email);

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
