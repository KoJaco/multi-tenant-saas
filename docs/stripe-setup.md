# 0) Prereqs & env

- Create a Stripe account (use **Test mode** while you wire this up).
- Add these env vars to your Remix app (server-side only):
    - `STRIPE_SECRET_KEY`
    - `STRIPE_WEBHOOK_SECRET`
    - `STRIPE_PRICE_PRO_MONTHLY`
    - `STRIPE_PRICE_SEAT_ADDON`
    - `STRIPE_PRICE_MINUTE_OVERAGE`
    - `STRIPE_PRICE_CLAIM_OVERAGE`
    - (Optional) `STRIPE_TAX_ENABLED=true`

**Refs:** Checkout Sessions API (what you’ll call from your server). ([Stripe Docs][1])

---

# 1) Model your catalog in Stripe

Create **one product** for your base plan, **one product** for Seats, and **two metered prices** for overage:

- **Product:** “Fact Checker Pro” → **recurring monthly price** (base subscription).
- **Product:** “Additional Seat” → **recurring monthly price** (quantity = seat count).
- **Product/Price:** “Audio Minutes (Overage)” → **metered** (attach a **Meter**).
- **Product/Price:** “Claims (Overage)” → **metered** (attach a **Meter**).
- **product/price:** "Credit Pack" → 3 fixed prices, 1 custom price.

You can do this in Dashboard or via API. ([Stripe Docs][2])

**Usage (Meters):** Stripe’s current usage-based billing uses **Meters**. Configure two meters (e.g., `audio_minutes` and `claims_checked`) and connect them to the metered prices above. ([Stripe Docs][3])

---

# 2) Enable the Customer Portal (self-serve manage billing)

- Turn on the **Customer Portal** in Dashboard (choose what customers can manage).
- From your app, create a **Portal Session** and redirect users there (“Manage billing” button). ([Stripe Docs][4])

---

# 3) Create/Upsert Stripe Customers for each Account

On account creation (or first visit to Billing settings):

- `stripe.customers.create({ email, metadata: { accountId } })`
- Persist `stripeCustomerId` on your `accounts` row.

(Products/Prices live in Stripe; your DB is only for quick access / feature gates.) ([Stripe Docs][5])

---

# 4) Start subscriptions with Checkout

Make a Remix **action** (server route) that creates a **Checkout Session** with **multiple subscription items**:

- Item A: base `price_pro_monthly` (quantity = 1)
- Item B: `price_seat_addon` (quantity = `seat_quantity`, default 1)
- Item C: `price_minute_overage` (metered; **no quantity**—usage will be reported)
- Item D: `price_claim_overage` (metered; **no quantity**)

Use `mode: 'subscription'` and pass the `customer`. After success, you’ll get an active **Subscription**. ([Stripe Docs][1])

---

# 5) Collect tax (GST in AU)

If you need GST/VAT, enable **Stripe Tax** (supports AU GST), and set your tax behaviour on prices or via Checkout. ([Stripe Docs][6])

---

# 6) Webhooks (single Remix endpoint)

Create `/webhooks/stripe` that:

- Reads the **raw** request body (don’t JSON-parse before signature check).
- Verifies the signature using `STRIPE_WEBHOOK_SECRET`.
- Handles these events:
    - `checkout.session.completed` (persist `stripe_subscription_id`, mark active)
    - `customer.subscription.created` / `updated` / `deleted`
    - `invoice.upcoming` (flush unreported usage—see §8)
    - `invoice.finalized` / `invoice.paid` / `invoice.payment_failed`
    - (Optional) `customer.subscription.trial_will_end`

**Refs:** Webhooks overview + signature verification; subscription webhooks lifecycle. ([Stripe Docs][7])

> Tip for Remix: the signature check requires the **raw** body. If you see “signature verification failed,” confirm you’re not touching the body before `stripe.webhooks.constructEvent`. ([Stripe Docs][8])

---

# 7) Seats (quantity-based add-on)

When the owner invites/removes members:

- **Update the seat subscription item quantity** on the active subscription.
- Stripe will **prorate** by default (configurable). ([Stripe Docs][9])

---

# 8) Recording usage (metered overage)

Your app writes **all** usage to your DB (seconds & claims). For Stripe:

1. **Only send overage** (excess over the included amounts in your Pro plan) during the current billing period.
2. Send **Meter Events** for each metric to Stripe (or, if you prefer classic flow, create Subscription Item Usage Records—but Meters are the current recommended path). ([Stripe Docs][10])

Run this:

- Nightly cron (or background job), and
- On `invoice.upcoming` (Stripe calls you before closing the invoice) → compute overage and push the latest usage so it’s captured on this invoice. ([Stripe Docs][10])

---

# 9) Feature gates in your Remix loaders

- Check `subscriptionStatus in ('active','trialing')`.
- Enforce `seatQuantity >= activeMembers`.
- Compare **internal counters** to Pro inclusions; if exceeded and **PAYG not enabled**, return a 402-style response / banner to upgrade or enable PAYG.
- Show “N minutes / M claims remaining” from your internal counters (Stripe only sees overage).

---

## Handy links (quick open)

- **Products & Prices (Dashboard/API):** manage your catalog. ([Stripe Docs][2])
- **Checkout Sessions (subs w/ multiple items):** create sessions from your server. ([Stripe Docs][1])
- **Quantities & multiple items in a subscription (Seats):** how quantities work. ([Stripe Docs][9])
- **Customer Portal:** let customers manage billing. ([Stripe Docs][4])
- **Usage-based billing (Meters):** configure meters + record usage (API). ([Stripe Docs][3])
- **Webhook basics & signature verification:** receive + verify safely. ([Stripe Docs][7])
- **Subscription lifecycle webhooks:** what to expect each period. ([Stripe Docs][11])
- **Tax (GST in AU):** enable and configure Stripe Tax. ([Stripe Docs][6])
- **Upcoming invoice API:** pull upcoming invoice if you want to preview totals. ([Stripe Docs][12])

---

If you want, I can drop in:

- A ready-to-paste Remix webhook route (raw-body safe).
- A tiny “post overage to Stripe” job (meters) that you can schedule nightly + on `invoice.upcoming`.
- A Checkout action that builds the 4-item subscription (Base, Seats, Minute meter, Claim meter).

[1]: https://docs.stripe.com/api/checkout/sessions?utm_source=chatgpt.com "Checkout Sessions | Stripe API Reference"
[2]: https://docs.stripe.com/products-prices/manage-prices?utm_source=chatgpt.com "Manage products and prices | Stripe Documentation"
[3]: https://docs.stripe.com/billing/subscriptions/usage-based/meters/configure?utm_source=chatgpt.com "Configure meters | Stripe Documentation"
[4]: https://docs.stripe.com/no-code/customer-portal?utm_source=chatgpt.com "Set up the customer portal | Stripe Documentation"
[5]: https://docs.stripe.com/billing?utm_source=chatgpt.com "Billing | Stripe Documentation"
[6]: https://docs.stripe.com/tax/supported-countries/asia-pacific/australia?utm_source=chatgpt.com "Collect tax in Australia | Stripe Documentation"
[7]: https://docs.stripe.com/webhooks?utm_source=chatgpt.com "Receive Stripe events in your webhook endpoint | Stripe Documentation"
[8]: https://docs.stripe.com/webhooks/signature?utm_source=chatgpt.com "Resolve webhook signature verification errors | Stripe Documentation"
[9]: https://docs.stripe.com/billing/subscriptions/quantities?utm_source=chatgpt.com "Set product or subscription quantities | Stripe Documentation"
[10]: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage?utm_source=chatgpt.com "Record usage for billing | Stripe Documentation"
[11]: https://docs.stripe.com/billing/subscriptions/webhooks?utm_source=chatgpt.com "Using webhooks with subscriptions | Stripe Documentation"
[12]: https://docs.stripe.com/api/invoices/upcoming?api-version=2024-12-18.acacia&utm_source=chatgpt.com "Retrieve an upcoming invoice | Stripe API Reference"
