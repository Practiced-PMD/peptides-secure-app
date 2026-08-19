// grant.js — one-time backfill for buyers who purchased on the OLD ATX account.
// Grants ONLY these specific, already-paid customers (verified in Stripe).
// Run once after deploy:  https://peptides.practiced.health/api/grant?run=1
import { setPaid, normEmail } from './_lib/store.js';

export const config = { path: '/api/grant' };

const ONE_YEAR = 365 * 24 * 60 * 60;
const LIFETIME = 100 * ONE_YEAR;

const GRANTS = [
  { email: 'drallen@newfreedomfamilymed.com', mode: 'lifetime' }, // Jennifer Allen — Peptides "Beyond the Course (Founding)" $975 one-time
];

const json = (o, s = 200) =>
  new Response(JSON.stringify(o, null, 2), { status: s, headers: { 'content-type': 'application/json' } });

export default async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get('run') !== '1') {
    return json({ ok: false, message: 'Add ?run=1 to the URL to grant the listed customers.' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  const done = [];
  for (const g of GRANTS) {
    const email = normEmail(g.email);
    const until = g.mode === 'lifetime' ? now + LIFETIME : now + ONE_YEAR;
    await setPaid(email, until, 'active');
    done.push({ email, mode: g.mode, paidThrough: until });
  }
  return json({ ok: true, granted: done, message: 'Done. They can now sign in with their email and get a 6-digit code. You can delete grant.js now.' });
};
