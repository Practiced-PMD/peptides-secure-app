// _lib/email.js — transactional email via the SendGrid v3 API (no SDK needed).
// App-neutral: brand comes from env vars APP_NAME and MAIL_FROM.
//
// Env vars:
//   SENDGRID_API_KEY   SG.xxxxx        (SendGrid API key, "Mail Send" permission)
//   MAIL_FROM          "Peptides, Practiced. <access@practiced.health>"
//   APP_NAME           "Peptides, Practiced."
//
// Exports the SAME function name the rest of the kit imports (sendCodeEmail),
// plus sendWelcomeEmail(email, pdfUrl) used by the Stripe webhook post-payment.

const SENDGRID_ENDPOINT = 'https://api.sendgrid.com/v3/mail/send';

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
  const subject = `Your access code: ${code}`;
  const text =
    `Your ${app} access code is: ${code}\n\n` +
    `Enter it in the app to unlock the full library. It expires in about 10 minutes.\n` +
    `If you didn't request this, you can ignore this email.`;
  const html = `
  <div style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#232a31;max-width:480px;margin:auto">
    <h2 style="color:#1F3A5F;margin:0 0 6px">Your access code</h2>
    <p style="margin:0 0 14px;color:#6b7783">Enter this in ${app} to unlock the full library.</p>
    <div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#EAF1F8;border:1px solid #cdddf0;border-radius:12px;padding:18px;text-align:center;color:#1F3A5F">${code}</div>
    <p style="margin:14px 0 0;color:#6b7783;font-size:13px">Expires in about 10 minutes. Didn't request it? Ignore this email.</p>
  </div>`;
  return sendViaSendGrid({ to: toEmail, subject, text, html });
}

// Post-payment welcome: how to sign in + the PDF download link.
export async function sendWelcomeEmail(toEmail, pdfUrl) {
  const app = process.env.APP_NAME || 'Your App';
  const link = pdfUrl || process.env.PDF_URL || '';
  const subject = `Welcome to ${app} — here's how to get in`;
  const text =
    `Welcome to ${app}.\n\n` +
    `To open the full library on any device:\n` +
    `  1. Go to the app and enter this email address (${toEmail}).\n` +
    `  2. We'll email you a 6-digit code.\n` +
    `  3. Enter the code to unlock. Your access works on up to 2 devices at once.\n\n` +
    (link ? `Your PDF field guide: ${link}\n\n` : '') +
    `Advanced medicine. Actual answers.`;
  const html = `
  <div style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#232a31;max-width:520px;margin:auto">
    <h2 style="color:#1F3A5F;margin:0 0 6px">Welcome to ${app}</h2>
    <p style="margin:0 0 14px;color:#6b7783">Here's how to open the full library on any device.</p>
    <ol style="margin:0 0 16px;padding-left:20px;color:#232a31">
      <li>Go to the app and enter this email address (<b>${String(toEmail).replace(/[<>&]/g, '')}</b>).</li>
      <li>We'll email you a <b>6-digit code</b>.</li>
      <li>Enter the code to unlock. Your access works on up to <b>2 devices</b> at once.</li>
    </ol>
    ${link ? `<p style="margin:0 0 16px"><a href="${link}" style="display:inline-block;background:#1F3A5F;color:#fff;padding:12px 18px;border-radius:9px;text-decoration:none;font-weight:600">Download your PDF field guide</a></p>` : ''}
    <p style="margin:18px 0 0;color:#2E7D8A;font-style:italic">Advanced medicine. Actual answers.</p>
  </div>`;
  return sendViaSendGrid({ to: toEmail, subject, text, html });
}
