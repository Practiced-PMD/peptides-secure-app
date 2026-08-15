// _lib/store.js — persistence on Netlify Blobs (free, built in; no extra account).
// Three stores:
//   licenses  : key = email        -> { email, paidThrough (unix), status }
//   codes     : key = email        -> { hash, exp } (6-digit code, hashed, ~10 min)
//   devices   : key = email        -> [ { device, firstSeen } ]  (for the 2-device cap)
import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';

const norm = (email) => String(email || '').trim().toLowerCase();
export const normEmail = norm;

// Grandfathered ("legacy") buyers — people who purchased on the old shared-code
// system before this email-license app existed. Set the LEGACY_PAID_EMAILS env var
// to a comma-separated list of their emails; they are treated as paid forever.
const LEGACY_PAID = new Set(
  String(process.env.LEGACY_PAID_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

const licenses = () => getStore('licenses');
const codes = () => getStore('codes');
const devices = () => getStore('devices');

// ---- licenses (written by Stripe webhook, read by request-code) ----
export async function setPaid(email, paidThroughUnix, status = 'active') {
  email = norm(email);
  await licenses().setJSON(email, { email, paidThrough: paidThroughUnix, status });
}
export async function getLicense(email) {
  return await licenses().get(norm(email), { type: 'json' });
}
export async function isPaidNow(email) {
  if (LEGACY_PAID.has(norm(email))) return true;   // grandfathered founding buyers
  const lic = await getLicense(email);
  if (!lic || lic.status === 'canceled') return false;
  if (lic.paidThrough && Date.now() / 1000 > lic.paidThrough) return false;
  return true;
}

// ---- one-time codes ----
const hashCode = (code) => crypto.createHash('sha256').update(String(code)).digest('hex');
export async function putCode(email, code, ttlSeconds = 600) {
  await codes().setJSON(norm(email), { hash: hashCode(code), exp: Math.floor(Date.now() / 1000) + ttlSeconds });
}
export async function checkCode(email, code) {
  const rec = await codes().get(norm(email), { type: 'json' });
  if (!rec) return false;
  if (Date.now() / 1000 > rec.exp) return false;
  const a = Buffer.from(rec.hash);
  const b = Buffer.from(hashCode(code));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export async function clearCode(email) { await codes().delete(norm(email)); }

// ---- device registry (2-device cap; oldest evicted on 3rd) ----
export async function registerDevice(email, device, cap = 2) {
  email = norm(email);
  let list = (await devices().get(email, { type: 'json' })) || [];
  list = list.filter((d) => d.device !== device);           // de-dupe same device
  list.push({ device, firstSeen: Math.floor(Date.now() / 1000) });
  list.sort((a, b) => a.firstSeen - b.firstSeen);
  const evicted = list.length > cap ? list.slice(0, list.length - cap) : [];
  list = list.slice(-cap);                                    // keep newest `cap`
  await devices().setJSON(email, list);
  return { active: list, evicted };
}
export async function deviceAllowed(email, device) {
  const list = (await devices().get(norm(email), { type: 'json' })) || [];
  return list.some((d) => d.device === device);
}
