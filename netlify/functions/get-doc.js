// get-doc.js — streams one protected file, but only to a licensed, active device.
// Files live under netlify/functions/_protected/ and are bundled with the function
// (see netlify.toml included_files), so they are NEVER served as public static assets.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyToken, bearer } from './_lib/token.js';
import { deviceAllowed } from './_lib/store.js';

export const config = { path: '/api/get-doc' };

// Protected downloads: id -> { file (relative to _protected/), type, filename }
const DOCS = {
  library: { file: 'library.zip', type: 'application/zip', filename: 'Peptides-Practiced-Library.zip' },
};

const deny = (msg, status) =>
  new Response(JSON.stringify({ ok: false, message: msg }), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const token = bearer(req) || url.searchParams.get('t');

  const claim = verifyToken(token);
  if (!claim) return deny('Not licensed. Please sign in.', 401);
  if (!(await deviceAllowed(claim.email, claim.device))) return deny('This device is no longer active on your license.', 403);

  const doc = id && DOCS[id];
  if (!doc) return deny('Unknown document.', 404);

  const p = fileURLToPath(new URL(`./_protected/${doc.file}`, import.meta.url));
  let bytes;
  try { bytes = await readFile(p); } catch { return deny('Document not found.', 404); }

  return new Response(bytes, {
    headers: {
      'content-type': doc.type,
      'content-disposition': `attachment; filename="${doc.filename}"`,
      'cache-control': 'private, no-store',
    },
  });
};
