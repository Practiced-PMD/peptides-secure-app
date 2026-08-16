// builder-access.js — tells the Builder page whether this signed-in device is
// entitled to the paid "Your Peptide Program Builder" add-on. Mirrors the security
// model of get-content.js: a valid license token on an active device, plus the
// separate Builder entitlement.
import { verifyToken, bearer } from './_lib/token.js';
import { deviceAllowed, isBuilderEntitled, isPaidNow } from './_lib/store.js';

export const config = { path: '/api/builder-access' };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' },
  });

export default async (req) => {
  const claim = verifyToken(bearer(req));
  if (!claim) return json({ entitled: false, reason: 'not_signed_in' }, 401);
  if (!(await deviceAllowed(claim.email, claim.device)))
    return json({ entitled: false, reason: 'device_inactive' }, 403);
  const entitled = await isBuilderEntitled(claim.email);
  const member = await isPaidNow(claim.email);   // library member → eligible for the $397 add-on price
  return json({ entitled, member, email: claim.email });
};
