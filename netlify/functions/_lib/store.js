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

// Netlify Blobs reads are "eventual" by default: after a key is UPDATED, reads can keep
// returning the OLD value for up to 60 seconds. For the one-time code and the 2-device
// list that is wrong: a device that has just signed in could be told "This device is no
// longer active" by the very next request (so the user is signed out again and has to sign
// in twice), a re-sent code could be rejected as wrong, and two sign-ins close together
// could each overwrite the other's device. These two stores are therefore always read with
// strong consistency. If the runtime can't do strong reads, fall back to the old behaviour.
async function readJSONStrong(store, key) {
  try {
    return await store.get(key, { type: 'json', consistency: 'strong' });
  } catch (e) {
    if (e && e.name === 'BlobsConsistencyError') return await store.get(key, { type: 'json' });
    throw e;
  }
}

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
  const rec = await readJSONStrong(codes(), norm(email));
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
  let list = (await readJSONStrong(devices(), email)) || [];
  list = list.filter((d) => d.device !== device);           // de-dupe same device
  list.push({ device, firstSeen: Math.floor(Date.now() / 1000) });
  list.sort((a, b) => a.firstSeen - b.firstSeen);
  const evicted = list.length > cap ? list.slice(0, list.length - cap) : [];
  list = list.slice(-cap);                                    // keep newest `cap`
  await devices().setJSON(email, list);
  return { active: list, evicted };
}
export async function deviceAllowed(email, device) {
  const list = (await readJSONStrong(devices(), norm(email))) || [];
  return list.some((d) => d.device === device);
}

// ---- Builder add-on entitlement (a SEPARATE paid product from the library) ----
// Buying the library does NOT unlock the Builder. Entitlement is granted either by
// the Stripe webhook (a purchase whose metadata.product === 'builder') or manually
// via the BUILDER_PAID_EMAILS env var (comma-separated) for early/comped buyers.
const BUILDER_PAID = new Set(
  String(process.env.BUILDER_PAID_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);
const builder = () => getStore('builder');
export async function setBuilderEntitled(email) {
  email = norm(email);
  await builder().setJSON(email, { email, entitled: true, since: Math.floor(Date.now() / 1000) });
}
export async function isBuilderEntitled(email) {
  if (BUILDER_PAID.has(norm(email))) return true;          // manual/comped grants
  const rec = await builder().get(norm(email), { type: 'json' });
  return !!(rec && rec.entitled);
}
