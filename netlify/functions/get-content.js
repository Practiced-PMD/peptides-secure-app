// get-content.js — returns one locked SECTION's HTML, but only to a device that
// holds a valid license token whose device is still among the active 2.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyToken, bearer } from './_lib/token.js';
import { deviceAllowed, isPaidNow } from './_lib/store.js';

export const config = { path: '/api/get-content' };

let SECTIONS = null;
async function sections() {
  if (SECTIONS) return SECTIONS;
  const p = fileURLToPath(new URL('./_protected/sections.json', import.meta.url));
  SECTIONS = JSON.parse(await readFile(p, 'utf8'));
  return SECTIONS;
}

const deny = (msg, status) => new Response(JSON.stringify({ ok: false, message: msg }), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('section');
  const token = bearer(req);

  const claim = verifyToken(token);
  if (!claim) return deny('Not licensed. Please sign in.', 401);
  if (!(await deviceAllowed(claim.email, claim.device))) return deny('This device is no longer active on your license.', 403);

  // Signed in, but bought only the Compliance-Ready Program. 402 (not 401/403), so the
  // app shows this message instead of signing them out of the program too.
  if (!(await isPaidNow(claim.email))) return deny('Your purchase is the Compliance-Ready Program. The Peptide Library is a separate purchase.', 402);

  const all = await sections();
  if (!id || !(id in all)) return deny('Unknown section.', 404);

  return new Response(JSON.stringify({ ok: true, id, html: all[id] }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });
};
