// _lib/email.js — send the 6-digit code via SendGrid's REST API (no SDK needed).
// MAIL_FROM may be "Name <access@practiced.health>" or just "access@practiced.health".
export async function sendCodeEmail(toEmail, code) {
  const key = process.env.SENDGRID_API_KEY;
  const rawFrom = process.env.MAIL_FROM || 'Peptides, Practiced <access@practiced.health>';
  if (!key) throw new Error('SENDGRID_API_KEY not set');

  // parse "Name <email>" into name + email for SendGrid's from object
  const m = rawFrom.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  const fromEmail = (m ? m[2] : rawFrom).trim();
  const fromName = (m && m[1].trim()) || 'Peptides, Practiced';

  // Keep the code OUT of the subject line — a bare code in the subject is a
  // classic phishing pattern that Microsoft 365 / Outlook quarantines. Neutral
  // subject + code in the body delivers far more reliably.
  const subject = 'Your Peptides, Practiced sign-in code';
  const text =
    `Hi,\n\n` +
    `Here is your sign-in code for Peptides, Practiced:\n\n` +
    `    ${code}\n\n` +
    `Enter it in the app to unlock the full library. This code is valid for about 30 minutes.\n` +
    `If you didn't request it, you can safely ignore this email.\n\n` +
    `— Peptides, Practiced · practiced.health`;
  const html = `
    <div style="font:16px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a;max-width:480px;margin:auto">
      <h2 style="color:#6d28d9;margin:0 0 6px">Your sign-in code</h2>
      <p style="margin:0 0 14px;color:#475569">Enter this code in Peptides, Practiced to unlock the full library.</p>
      <div style="font-size:34px;font-weight:800;letter-spacing:8px;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:18px;text-align:center;color:#6d28d9">${code}</div>
      <p style="margin:14px 0 0;color:#64748b;font-size:13px">Valid for about 30 minutes. Didn't request it? You can ignore this email.</p>
      <p style="margin:16px 0 0;color:#94a3b8;font-size:12px">Peptides, Practiced · practiced.health</p>
    </div>`;

  const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: toEmail }] }],
      from: { email: fromEmail, name: fromName },
      reply_to: { email: fromEmail, name: fromName },
      subject,
      content: [
        { type: 'text/plain', value: text },
        { type: 'text/html', value: html },
      ],
    }),
  });
  // SendGrid returns 202 Accepted on success
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`SendGrid failed (${res.status}): ${detail}`);
  }
  return true;
}
