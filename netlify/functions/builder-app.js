// builder-app.js — serves the Compliance-Ready Program script (_protected/builder-app.js)
// only to a signed-in, active device whose email holds the Builder entitlement. Same
// checks as builder-access.js; the public /builder page is just the lock screen + sign-in.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyToken, bearer } from './_lib/token.js';
import { deviceAllowed, isBuilderEntitled } from './_lib/store.js';

export const config = { path: '/api/builder-app' };

let APP = null;
async function app() {
  if (APP) return APP;
  APP = await readFile(fileURLToPath(new URL('./_protected/builder-app.js', import.meta.url)), 'utf8');
  return APP;
}

const deny = (msg, status) => new Response(JSON.stringify({ ok: false, message: msg }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
});

export default async (req) => {
  const claim = verifyToken(bearer(req));
  if (!claim) return deny('Not signed in.', 401);
  if (!(await deviceAllowed(claim.email, claim.device))) return deny('This device is no longer active on your license.', 403);
  if (!(await isBuilderEntitled(claim.email))) return deny('The Compliance-Ready Program is not unlocked for this email.', 403);
  return new Response(await app(), {
    headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'private, no-store' },
  });
};
