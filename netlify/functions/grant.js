// grant.js — one-time backfill for the founding peptide buyers who purchased on the
// OLD ATX account (before checkout moved to Practiced.health). Grants ONLY these
// specific, already-paid customers ($975 "Beyond the Course — Founding", lifetime).
// Run once after deploy:  https://peptides.practiced.health/api/grant?run=1
import { setPaid, normEmail } from './_lib/store.js';

export const config = { path: '/api/grant' };

const ONE_YEAR = 365 * 24 * 60 * 60;
const LIFETIME = 100 * ONE_YEAR;

// 17 founding buyers, all $975 one-time (lifetime access). Verified in Stripe.
const GRANTS = [
  'kidneyhmd@gmail.com',
  'irenem.carr@gmail.com',
  'drtom.soim@gmail.com',
  'aingrammd@yahoo.com',
  'drcarolynhelser@reagan.com',
  'drkarney@vitalityrenewal.org',
  'tami_lyday@hotmail.com',
  'drstills@drstills.com',
  'drmary@theremedyroom.com',
  'drallen@newfreedomfamilymed.com',
  'huivoon09@gmail.com',
  'lisa@drlisaballehr.com',
  'docjuliagreenspan@gmail.com',
  'jbrossfield@gmail.com',
  'eeprokop@gmail.com',
  'pichardo.gabriela@ymail.com',
  'debbiejeanjudd@gmail.com',
].map((email) => ({ email, mode: 'lifetime' }));

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
    done.push({ email, mode: g.mode });
  }
  return json({ ok: true, count: done.length, granted: done, message: 'Done. All founders can now sign in with their purchase email and get a 6-digit code. You can delete grant.js now.' });
};
