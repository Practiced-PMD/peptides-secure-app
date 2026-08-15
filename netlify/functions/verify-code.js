// verify-code.js — user submits email + 6-digit code (+ a device id).
// If valid, mint a license token good until their paid-through date, and
// enforce the 2-device cap (a 3rd device evicts the oldest).
import { checkCode, clearCode, getLicense, isPaidNow, registerDevice, normEmail } from './_lib/store.js';
import { mintToken, newDeviceId } from './_lib/token.js';

export const config = { path: '/api/verify-code' };
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, message: 'POST only' }, 405);
  let email, code, device;
  try { ({ email, code, device } = await req.json()); } catch { return json({ ok: false, message: 'bad request' }, 400); }
  email = normEmail(email);
  code = String(code || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return json({ ok: false, message: 'Enter your email and the 6-digit code.' }, 400);

  if (!(await isPaidNow(email))) return json({ ok: false, message: "We couldn't find an active purchase for that email." }, 403);
  if (!(await checkCode(email, code))) return json({ ok: false, message: 'That code is wrong or expired. Request a new one.' }, 401);

  await clearCode(email); // one-time use
  device = (device && String(device).slice(0, 32)) || newDeviceId();
  const { active, evicted } = await registerDevice(email, device, 2);

  const lic = await getLicense(email);
  const exp = Math.min(lic?.paidThrough || 0, Math.floor(Date.now() / 1000) + 400 * 24 * 3600) || Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  const token = mintToken({ email, device, exp });

  return json({
    ok: true, token, email, device, exp,
    message: 'Unlocked. Welcome in.',
    evicted: evicted.length ? evicted.map((d) => d.device) : [],
    devices: active.length,
  });
};
