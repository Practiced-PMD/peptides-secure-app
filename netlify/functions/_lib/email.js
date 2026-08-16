// _lib/email.js — transactional email via the SendGrid v3 API (no SDK needed).
// App-neutral: brand comes from env vars APP_NAME and MAIL_FROM.
//
// Env vars:
//   SENDGRID_API_KEY   SG.xxxxx        (SendGrid API key, "Mail Send" permission)
//   MAIL_FROM          "Peptides, Practiced. <access@practiced.health>"
//   APP_NAME           "Peptides, Practiced."
//   APP_URL            "https://peptides.practiced.health"  (link buyers click to open the app)
//
// Exports the SAME function name the rest of the kit imports (sendCodeEmail),
// plus sendWelcomeEmail(email) used by the Stripe webhook post-payment.

const SENDGRID_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';

// Where the app lives — used to give buyers one-click links into the app.
// Reads APP_URL if set, otherwise falls back to the live branded domain.
function appUrl() {
  return (process.env.APP_URL || 'https://peptides.practiced.health').replace(/\/+$/, '');
}

// Parse a "Name <addr@x>" MAIL_FROM string into SendGrid's { email, name } shape.
function parseFrom(raw, app) {
  const fallback = { email: 'access@practiced.health', name: app };
  if (!raw) return fallback;
  const m = String(raw).match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { email: m[2].trim(), name: (m[1] || app).trim() };
  return { email: String(raw).trim(), name: app };
}

async function sendViaSendGrid({ to, subject, text, html }) {
  const key = process.env.SENDGRID_API_KEY;
  const app = process.env.APP_NAME || 'Your App';
  if (!key) throw new Error('SENDGRID_API_KEY not set');
  const from = parseFrom(process.env.MAIL_FROM, app);

  const body = {
    personalizations: [{ to: [{ email: to }] }],
    from,
    subject,
    content: [
      { type: 'text/plain', value: text },
      { type: 'text/html', value: html },
    ],
  };

  const res = await fetch(SENDGRID_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // SendGrid returns 202 Accepted on success, with an empty body.
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`SendGrid failed (${res.status}): ${detail}`);
  }
  return true;
}

// The 6-digit sign-in code. Same signature the other functions import.
export async function sendCodeEmail(toEmail, code) {
  const app = process.env.APP_NAME || 'Your App';
  const url = appUrl();
  const subject = `Your access code: ${code}`;
  const text =
    `Your ${app} access code is: ${code}\n\n` +
    `Open the library: ${url}\n` +
    `Enter the code above to unlock the full library. It expires in about 10 minutes.\n\n` +
    `If you didn't request this, you can ignore this email.`;
  const html = `
  <div style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#232a31;max-width:480px;margin:auto">
    <h2 style="color:#1F3A5F;margin:0 0 6px">Your access code</h2>
    <p style="margin:0 0 14px;color:#6b7783">Enter this in ${app} to unlock the full library.</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#EAF1F8;border:1px solid #cdddf0;border-radius:12px;padding:18px;text-align:center;color:#1F3A5F">${code}</div>
    <p style="margin:16px 0 0;text-align:center"><a href="${url}" style="display:inline-block;background:#1F3A5F;color:#fff;padding:12px 20px;border-radius:9px;text-decoration:none;font-weight:600">Open the library</a></p>
    <p style="margin:14px 0 0;color:#6b7783;font-size:13px">Expires in about 10 minutes. Didn't request it? Ignore this email.</p>
  </div>`;
  return sendViaSendGrid({ to: toEmail, subject, text, html });
}

// Post-payment welcome: how to sign in + a one-click link into the app + the gated PDF download.
export async function sendWelcomeEmail(toEmail) {
  const app = process.env.APP_NAME || 'Your App';
  const url = appUrl();
  const dl = url + '/download.html'; // gated download page (requires sign-in on that device)
  const safeEmail = String(toEmail).replace(/[<>&]/g, '');
  const subject = `Welcome to ${app} — here's how to get in`;
  const text =
    `Welcome to ${app}.\n\n` +
    `Open the library: ${url}\n\n` +
    `To unlock the full library on any device:\n` +
    `  1. Go to ${url} and enter this email address (${toEmail}).\n` +
    `  2. We'll email you a 6-digit code.\n` +
    `  3. Enter the code to unlock. Your access works on up to 2 devices at once.\n\n` +
    `Prefer the PDF pack? Once you're signed in, download the whole library here: ${dl}\n\n` +
    `Advanced medicine. Actual answers.`;
  const html = `
  <div style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#232a31;max-width:520px;margin:auto">
    <h2 style="color:#1F3A5F;margin:0 0 6px">Welcome to ${app}</h2>
    <p style="margin:0 0 16px;color:#6b7783">You're in. Open the library and sign in with this email.</p>
    <p style="margin:0 0 18px"><a href="${url}" style="display:inline-block;background:#1F3A5F;color:#fff;padding:13px 22px;border-radius:9px;text-decoration:none;font-weight:600;font-size:17px">Open the library</a></p>
    <p style="margin:0 0 8px;color:#232a31;font-weight:600">How to unlock on any device:</p>
    <ol style="margin:0 0 16px;padding-left:20px;color:#232a31">
      <li>At the app, enter this email address (<b>${safeEmail}</b>).</li>
      <li>We'll email you a <b>6-digit code</b>.</li>
      <li>Enter the code to unlock. Your access works on up to <b>2 devices</b> at once.</li>
    </ol>
    <p style="margin:0 0 6px;color:#232a31;font-weight:600">Prefer a downloadable PDF pack?</p>
    <p style="margin:0 0 16px"><a href="${dl}" style="display:inline-block;background:#2E7D8A;color:#fff;padding:11px 18px;border-radius:9px;text-decoration:none;font-weight:600">Download your PDF library</a><br><span style="font-size:12.5px;color:#8a94a0">You'll be asked to sign in first (same email) — that keeps the library members-only.</span></p>
    <p style="margin:18px 0 0;color:#2E7D8A;font-style:italic">Advanced medicine. Actual answers.</p>
  </div>`;
  return sendViaSendGrid({ to: toEmail, subject, text, html });
}
