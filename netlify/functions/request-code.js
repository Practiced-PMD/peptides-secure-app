// request-code.js — user types their email; if it paid, email them a 6-digit code.
// Always returns the same friendly message (don't reveal who has paid).
import crypto from 'node:crypto';
import { isPaidNow, putCode, normEmail } from './_lib/store.js';
import { sendCodeEmail } from './_lib/email.js';

export const config = { path: '/api/request-code' };

const OK = { ok: true, message: 'If that email has an active purchase, we just sent it a 6-digit code. Check your inbox (and spam).' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405);
  let email;
  try { ({ email } = await req.json()); } catch { return json({ ok: false, message: 'bad request' }, 400); }
  email = normEmail(email);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ ok: false, message: 'Please enter a valid email.' }, 400);

  // Only paid emails get a code. Unpaid → same message, no email sent.
  if (await isPaidNow(email)) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    await putCode(email, code, 600);
    try { await sendCodeEmail(email, code); }
    catch (e) { return json({ ok: false, message: 'We could not send the email right now. Please try again shortly.' }, 502); }
  }
  return json(OK);
};
