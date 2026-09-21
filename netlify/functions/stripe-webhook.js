// stripe-webhook.js — Stripe calls this when a payment succeeds.
// Verifies Stripe's signature (no SDK needed) and records the buyer's email as paid.
//
// MULTI-APP NOTE: Mold and Peptides share ONE Stripe account, so Stripe broadcasts
// EVERY sale to BOTH apps' webhooks. Mold sales are identified by the 'app=mold'
// metadata on the Mold payment links (and by known Mold link IDs as a backstop).
// This webhook ignores those, so a Mold buyer is never enrolled in Peptides or sent
// the Peptides welcome email.
import crypto from 'node:crypto';
import { setPaid, setBuilderEntitled, normEmail } from './_lib/store.js';
import { sendWelcomeEmail } from './_lib/email.js';

export const config = { path: '/api/stripe-webhook' };

const ONE_YEAR = 365 * 24 * 60 * 60;

// Payment links that belong to the OTHER app (Mold). Backstop in case a sale is
// somehow untagged. Add more Mold link IDs here if you create them.
const MOLD_LINK_IDS = new Set([
  'plink_1U6C5KGXQUgvgXPScSc2sRZs', // Mold — annual $199
]);

// True when this sale belongs to the Mold app, not Peptides.
function isMoldSale(o) {
  if (o.payment_link && MOLD_LINK_IDS.has(o.payment_link)) return true;
  const tag = o.client_reference_id || o.metadata?.app;
  return tag === 'mold';
}

function verifyStripeSig(rawBody, sigHeader, secret, toleranceSec = 300) {
  if (!sigHeader) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map((p) => p.split('=')));
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  const signed = `${t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  const a = Buffer.from(v1), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false; // replay guard
  return true;
}

export default async (req) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('not configured', { status: 500 });

  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!verifyStripeSig(raw, sig, secret)) return new Response('bad signature', { status: 400 });

  let event;
  try { event = JSON.parse(raw); } catch { return new Response('bad json', { status: 400 }); }
  const o = event.data?.object || {};

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        // Ignore sales that belong to the Mold app (Stripe forwards them here too).
        if (isMoldSale(o)) break;

        const email = o.customer_details?.email || o.customer_email;
        if (email) {
          // Builder purchase — flagged by either the payment link's metadata
          // (metadata.product='builder') or its client_reference_id ('builder').
          // Grants ONLY the Builder entitlement.
          const isBuilder = o.metadata?.product === 'builder' || o.client_reference_id === 'builder';
          if (isBuilder) {
            await setBuilderEntitled(email);
          } else {
            // Library purchase (existing behavior, unchanged).
            const until = o.subscription && o.expires_at ? o.expires_at : Math.floor(Date.now() / 1000) + ONE_YEAR;
            await setPaid(email, until, 'active');
            // Post-payment welcome: sign-in instructions + PDF download link.
            // Never fail the webhook if email delivery throws — Stripe must still get a 200.
            try {
              await sendWelcomeEmail(email, process.env.PDF_URL || '');
            } catch (mailErr) {
              console.error('welcome email failed (non-fatal):', mailErr && mailErr.message);
            }
          }
        }
        break;
      }
      case 'invoice.paid':
      case 'invoice.payment_succeeded': {
        const email = o.customer_email || o.customer_details?.email;
        const until = o.lines?.data?.[0]?.period?.end || Math.floor(Date.now() / 1000) + ONE_YEAR;
        if (email) await setPaid(email, until, 'active');
        break;
      }
      case 'customer.subscription.deleted': {
        const email = o.customer_email; // may require expansion; renewals simply lapse otherwise
        if (email) await setPaid(email, Math.floor(Date.now() / 1000), 'canceled');
        break;
      }
      default: break; // ignore other events
    }
  } catch (e) {
    return new Response('handler error: ' + e.message, { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'content-type': 'application/json' } });
};
