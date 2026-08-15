// _lib/token.js — stateless license tokens, signed with HMAC-SHA256.
// A token proves "this email is licensed, on this device, until this date."
// No DB read is needed to verify it — the signature is the proof.
import crypto from 'node:crypto';

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const fromB64url = (s) => Buffer.from(s, 'base64url');

function secret() {
  const s = process.env.LICENSE_SIGNING_SECRET;
  if (!s) throw new Error('LICENSE_SIGNING_SECRET not set');
  return s;
}

// Mint a license token. payload = { email, device, exp (unix seconds) }
export function mintToken(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest();
  return `${body}.${b64url(sig)}`;
}

// Verify + decode. Returns payload object or null if invalid/expired.
export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', secret()).update(body).digest();
  let given;
  try { given = fromB64url(sig); } catch { return null; }
  if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
  let payload;
  try { payload = JSON.parse(fromB64url(body).toString('utf8')); } catch { return null; }
  if (!payload || !payload.exp || Date.now() / 1000 > payload.exp) return null;
  return payload;
}

// Pull a bearer token from a request's Authorization header.
export function bearer(req) {
  const h = req.headers.get('authorization') || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

// A short, stable id for a device (random, generated client-side and sent up).
export function newDeviceId() {
  return crypto.randomBytes(9).toString('base64url');
}
