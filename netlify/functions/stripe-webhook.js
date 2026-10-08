// stripe-webhook.js — Stripe calls this when a payment succeeds.
// Verifies Stripe's signature (no SDK needed) and records the buyer's email as paid.
//
// MULTI-APP NOTE: Mold and Peptides share ONE Stripe account, so Stripe broadcasts
// EVERY sale to BOTH apps' webhooks. Mold sales are identified by the 'app=mold'
// metadata on the Mold payment links (and by known Mold link IDs as a backstop).
// This webhook ignores those, so a Mold buyer is never enrolled in Peptides or sent
// the Peptides welcome email.
import crypto from 'node:crypto';
import { setPaid, setBuilderEntitled, setBuilderHeld, isPaidNow, normEmail } from './_lib/store.js';
import { sendWelcomeEmail, sendOwnerNotice } from './_lib/email.js';

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

// The two Builder prices, in cents, BEFORE any discount code (Stripe's amount_subtotal).
// The $397 member add-on is only for people who already own the library; $797 is for
// everyone else. The price is checked as well as the link tag, so a Builder purchase with
// the tag stripped off the link can't fall through to the library grant below.
const BUILDER_ADDON_CENTS = 39700;
const BUILDER_STANDALONE_CENTS = 79700;

// 'addon', 'standalone', or null (not a Builder purchase).
function builderKind(o) {
  const ref = o.client_reference_id;
  if (ref === 'builder-addon' || o.amount_subtotal === BUILDER_ADDON_CENTS) return 'addon';
  if (ref === 'builder' || o.metadata?.product === 'builder' || o.amount_subtotal === BUILDER_STANDALONE_CENTS) return 'standalone';
  return null;
}

// True when an invoice belongs to a subscription. Older Stripe API versions put the id on
// invoice.subscription; newer ones move it under invoice.parent. billing_reason covers both.
function isSubscriptionInvoice(o) {
  if (o.subscription || o.parent?.subscription_details?.subscription) return true;
  return String(o.billing_reason || '').startsWith('subscription');
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
          // Builder purchase: grants ONLY the Builder entitlement. The $397 member price
          // unlocks only for an email that owns the library; anyone else who pays it is held
          // (not unlocked) and the owner is emailed to refund it or unlock it by hand.
          const kind = builderKind(o);
          if (kind === 'addon' && !(await isPaidNow(email))) {
            await setBuilderHeld(email, 'addon_price_not_a_library_member', o.id);
            try {
              await sendOwnerNotice(
                'Builder add-on paid by a non-member: not unlocked',
                `${normEmail(email)} paid the $397 library-member price for the Compliance-Ready Program ` +
                `(Stripe checkout ${o.id}), but that email does not own the Peptides, Practiced. library, ` +
                `so the program was NOT unlocked.\n\n` +
                `If they are a member under a different email, or you want to give them access anyway, add ` +
                `this email to BUILDER_PAID_EMAILS in Netlify (site settings, Environment variables). ` +
                `Otherwise refund the payment in Stripe, or have them pay the $797 price.`
              );
            } catch (mailErr) {
              console.error('owner notice failed (non-fatal):', mailErr && mailErr.message);
            }
          } else if (kind) {
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
        // Every Peptides product (library, Builder add-on, Builder standalone) is a one-time
        // purchase, granted above on checkout.session.completed. The only subscription on the
        // shared Stripe account is Mold's yearly plan, so a subscription invoice here is always
        // a Mold sale or renewal. Ignore it, or every Mold buyer would get the Peptides library.
        // If a Peptides subscription is ever added, grant on its own product here instead.
        if (isSubscriptionInvoice(o)) break;

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
