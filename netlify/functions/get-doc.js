// get-doc.js — streams one protected file, only to a licensed, active device.
// Put protected PDFs in _protected/docs/<id>.pdf and list their ids below.
// If your app has no protected PDFs, leave DOCS empty.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { verifyToken, bearer } from './_lib/token.js';
import { deviceAllowed } from './_lib/store.js';

export const config = { path: '/api/get-doc' };

// EDIT for your app: the allowed document ids (filenames without .pdf).
const DOCS = [];

const deny = (msg, status) => new Response(JSON.stringify({ ok: false, message: msg }), { status, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  const token = bearer(req) || url.searchParams.get('t');

  const claim = verifyToken(token);
  if (!claim) return deny('Not licensed.', 401);
  if (!(await deviceAllowed(claim.email, claim.device))) return deny('This device is no longer active.', 403);
  if (!id || !DOCS.includes(id)) return deny('Unknown document.', 404);

  const p = fileURLToPath(new URL(`./_protected/docs/${id}.pdf`, import.meta.url));
  let bytes;
  try { bytes = await readFile(p); } catch { return deny('Document not found.', 404); }

  return new Response(bytes, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${id}.pdf"`,
      'cache-control': 'private, no-store',
    },
  });
};
