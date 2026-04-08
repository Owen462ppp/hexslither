const { Resend } = require('resend');

async function sendVerificationCode(email, code) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`\n[2FA] Verification code for ${email}: ${code}\n`);
    return;
  }

  const resend = new Resend(process.env.RESEND_API_KEY);

  await resend.emails.send({
    from: 'DuelSeries <noreply@duelseries.com>',
    to:   email,
    subject: `${code} — Your DuelSeries verification code`,
    html: `
      <div style="font-family:Segoe UI,sans-serif;background:#070707;padding:40px 0;min-height:200px">
        <div style="max-width:420px;margin:0 auto;background:#111;border:1px solid #222;border-radius:16px;padding:36px 32px;text-align:center">
          <h1 style="color:#fff;font-size:1.6rem;letter-spacing:2px;margin:0 0 4px">
            DUEL<span style="color:#14F195">SERIES</span>
          </h1>
          <p style="color:#6b7280;font-size:0.85rem;margin:0 0 28px;letter-spacing:1px">NEW DEVICE SIGN-IN</p>
          <p style="color:#ccc;font-size:0.95rem;margin:0 0 20px">
            Enter this code to verify your identity. It expires in <strong style="color:#fff">10 minutes</strong>.
          </p>
          <div style="background:#0a0a0a;border:1px solid #1e1e1e;border-radius:12px;padding:20px;margin-bottom:24px">
            <span style="font-size:2.6rem;font-weight:700;letter-spacing:10px;color:#14F195;font-family:monospace">${code}</span>
          </div>
          <p style="color:#4b5563;font-size:0.78rem;margin:0">
            If you didn't try to sign in, you can safely ignore this email.
          </p>
        </div>
      </div>
    `,
  });

  console.log(`[2FA] Code sent to ${email}`);
}

module.exports = { sendVerificationCode };
