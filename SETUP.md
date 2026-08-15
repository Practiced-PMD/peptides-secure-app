# Peptides, Practiced. — Go-Live Setup

This is the secure, email-license version of the app. The paid volumes are **not**
in the public web page anymore — they live on the server and are released only to a
signed-in, paying device. Volume 01 (Mitochondrial) and the Dose Calculator stay free.

You (or Jonathan) do the steps below **once**. It is mostly clicking through Netlify
and Stripe and pasting a few values. No coding required.

---

## How it works (plain language)

- A buyer pays in Stripe. Stripe tells our site "this email paid."
- The buyer opens the app, types the email they paid with, and taps **Email me a code**.
- We email them a **6-digit code**. They type it in and they're unlocked.
- Their unlock works on **up to 2 devices** at once. A 3rd device bumps the oldest.
- The paid content is fetched from the server only after they're verified — so it can't
  be scraped from the public page.

---

## What's in this folder

```
public/                         ← the public website (this is what visitors see)
  index.html                    ← the app (free preview + sign-in)
  library-data.js               ← ONLY the free content (Vol 01 + short previews)
  sw.js, manifest.json, icons   ← installable-app files
  downloads/                    ← put your PDF here (see step 6)
netlify/functions/              ← the secure backend
  stripe-webhook.js             ← records who paid + sends the welcome email
  request-code.js               ← emails the 6-digit code
  verify-code.js                ← checks the code, unlocks, enforces 2 devices
  get-content.js                ← serves a locked section to a verified device
  get-doc.js                    ← (optional) serves a gated PDF
  _lib/                         ← token signing, storage, email (SendGrid)
  _protected/sections.json      ← the PAID volumes (never served publicly)
netlify.toml, package.json      ← build config
```

---

## GO-LIVE CHECKLIST

### 1. Put the code in a NEW GitHub repo
- Create a brand-new, **private** GitHub repository (e.g. `peptides-practiced-secure`).
- Upload the entire contents of this folder to it (keep the folder structure exactly).

### 2. Create a NEW Netlify site connected to that repo
- In Netlify: **Add new site → Import an existing project → GitHub →** pick the new repo.
- Build settings are read automatically from `netlify.toml` (publish folder `public`,
  functions folder `netlify/functions`). Just click **Deploy**.
- After it deploys, note your site URL. It looks like `https://something.netlify.app`.
  (You can rename it, or attach `app.practiced.health`, under Site settings → Domain.)
  Everywhere below, `<yoursite>` means that final URL.

### 3. Set the environment variables in Netlify
Netlify → your site → **Site configuration → Environment variables → Add a variable.**
Add each of these (name on the left, value on the right):

| Variable | Value |
|---|---|
| `SENDGRID_API_KEY` | Your SendGrid API key (starts with `SG.`). Create it in SendGrid → Settings → API Keys, with **Mail Send** permission. |
| `MAIL_FROM` | `Peptides, Practiced. <access@practiced.health>` (must be a SendGrid-verified sender/domain) |
| `APP_NAME` | `Peptides, Practiced.` |
| `LICENSE_SIGNING_SECRET` | A long random secret, unique to THIS app. **Suggested value (freshly generated for you):** `d0517c4b8df91822e9e100f7ef65521e6db498fecbd9ada0fda8cfcfab56fb97` — or generate your own and keep it secret. Never share or reuse it. |
| `STRIPE_WEBHOOK_SECRET` | You'll get this in step 5 (`whsec_...`). Add it after you create the webhook. |
| `PDF_URL` | `https://<yoursite>/downloads/peptides-field-guide.pdf` |

After adding/changing env vars, trigger a redeploy (Netlify → Deploys → **Trigger deploy**).

> **SendGrid note:** the sender domain/address in `MAIL_FROM` must be verified in
> SendGrid (Single Sender or Domain Authentication), or the code/welcome emails won't send.

### 4. (SendGrid sender) verify your "from" address
- In SendGrid, verify `access@practiced.health` (or your chosen sender) under
  **Settings → Sender Authentication**. Domain authentication (whole `practiced.health`)
  gives the best deliverability.

### 5. Add the Stripe webhook (in the Practiced.health Stripe account)
- Stripe Dashboard → **Developers → Webhooks → Add endpoint.**
- Endpoint URL: `https://<yoursite>/api/stripe-webhook`
- Select these events:
  - `checkout.session.completed`
  - `invoice.paid`
  - `invoice.payment_succeeded`
  - `customer.subscription.deleted`
- Create it, then click the new endpoint and **reveal the Signing secret** (`whsec_...`).
- Paste that value into Netlify as `STRIPE_WEBHOOK_SECRET` (step 3) and redeploy.

> The Mold Treatment Playbook / PharmacopeiaMD sites already have working Stripe webhooks
> set up the same way — this is a new, separate one for this app. Each app has its own.

### 6. Drop in the real PDF
- Put your PDF file into the `public/downloads/` folder and name it exactly
  `peptides-field-guide.pdf` (matches the `PDF_URL` above). Commit + push.
- If you name it something else, update `PDF_URL` in Netlify to match.
- It will be downloadable at `https://<yoursite>/downloads/peptides-field-guide.pdf`,
  and that's the link the welcome email sends after purchase.

### 7. Point the payment link back to the app
- In Stripe, on your Payment Link / Checkout, set the **post-payment redirect** (confirmation page)
  to your app URL: `https://<yoursite>/` so buyers land on the app after paying.
- The buyer also gets the welcome email automatically (sign-in steps + PDF link), so even
  if they close the tab, they know exactly how to get in.

---

## Test it end-to-end (do this before announcing)
1. Make a real (or Stripe test-mode) purchase with an email you control.
2. Confirm you receive the **welcome email** (sign-in steps + PDF link).
3. Open `https://<yoursite>/`, tap **Sign in**, enter that email → you get a **6-digit code** email.
4. Enter the code → the full library unlocks and locked volumes load.
5. Open the site on a 2nd device and repeat — both work. On a 3rd, the oldest signs out.
6. Sanity check security: on a signed-OUT browser, you can read Volume 01 but every other
   volume shows a lock and its full text is **not** present in the page source.

---

## Optional: serve the PDF behind the license instead of publicly
The primary (and simplest) delivery is the public `/downloads/` link in the welcome email.
If you'd rather gate the PDF so only signed-in devices can open it:
1. Put the PDF at `netlify/functions/_protected/docs/fieldguide.pdf`.
2. In `netlify/functions/get-doc.js`, set `const DOCS = ['fieldguide'];`.
3. Link to it as `/api/get-doc?id=fieldguide` from inside a licensed view.
(You can keep both — the public link for the email, the gated route for in-app.)

---

## If you ever update the content
- Re-run the content split so paid volumes stay out of `public/library-data.js` and go into
  `netlify/functions/_protected/sections.json`. (Keep Volume 01 full in the public file.)
- Bump the service-worker cache name in `public/sw.js` (currently `peptides-practiced-v11`)
  so returning users pull the new version.

## A note on the app icons
The three PNG icons (`icon-192`, `icon-512`, `icon-maskable`) are clean navy placeholders.
If you want the exact brand icons, drop your originals into `public/` with those same
filenames and redeploy.
