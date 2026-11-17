---
name: flutterwave-integration
description: >-
  How SellSnap integrates Flutterwave: creating payment links, the kobo-to-naira
  unit boundary, verifying transactions, handling webhooks idempotently, and testing
  in sandbox mode. Covers the payment link endpoint, the verify endpoint, webhook
  signature checks, and the duplicate-payment guard.
---

# Flutterwave Integration Skill

Load this skill for any task that touches Flutterwave: creating payment links, verifying transactions, handling webhooks, or debugging payment flows. Do not write Flutterwave code from memory. Flutterwave's API changes, and this skill is the source of truth for how SellSnap uses it.

If you are creating a route handler, also read `skills/api-route-scaffolder/SKILL.md`. This skill owns the payment-specific rules.

## What Flutterwave Does for SellSnap

Flutterwave is our payment gateway. It does three things for us:

1. **Hosts the checkout page.** When a buyer clicks "Pay Now," we hand them off to Flutterwave's hosted checkout. We never collect card details in our own UI. This keeps us out of PCI compliance scope.
2. **Processes the payment.** Flutterwave charges the card, handles 3D Secure, handles bank transfers, and settles the money.
3. **Notifies us via webhook.** When a payment succeeds or fails, Flutterwave sends a webhook to our server. The webhook is how we know the truth.

## The Payment Flow End to End

```
Buyer clicks "Pay Now"
        |
        v
POST /api/orders (creates pending Order; transactionReference = tx_ref, amount in kobo)
        |
        v
Server calls Flutterwave "create payment link" endpoint
        |   amount sent in NAIRA (order.amount / 100)
        v
Server returns hosted checkout URL to the browser
        |
        v
Browser redirects to Flutterwave
        |
        v
Buyer pays on Flutterwave's page
        |
        v
Flutterwave redirects buyer to /p/[slug]/success (untrusted, display only)
        |
        v
Flutterwave sends webhook to /api/webhooks/flutterwave (TRUSTED)
        |
        v
Webhook handler verifies verif-hash, verifies transaction via API, marks Order paid
        |
        v
Seller notified via dashboard + email
```

The key insight: the browser redirect and the webhook are two different things. The browser redirect is just a UX signal to tell the buyer "we are checking your payment." The webhook is what actually updates the database.

## The Unit Boundary (Most Important Section)

This is the single highest-risk thing in the whole integration. Getting it wrong charges buyers 100x too much or 100x too little.

| Layer | Unit | Example |
|---|---|---|
| Database (`Product.price`, `Order.amount`) | **kobo**, integer | `500000` |
| Display in our UI | naira, string | `"₦5,000"` |
| **Request to Flutterwave** | **naira, integer** | `5000` |
| **Amount in Flutterwave's verify response** | **naira, integer** | `5000` |

**Flutterwave expects major units. We store minor units.** Paystack takes kobo. Flutterwave does not. This is the most common integration bug for anyone who has worked with Paystack before, and it fails silently — the API accepts the number and charges it.

```ts
// Correct: kobo -> naira at the gateway boundary
const amountInNaira = Math.round(order.amount / 100);
```

Two consequences:

- **SellSnap prices must be whole naira.** `Product.price` should always be a multiple of 100. Flutterwave takes an integer amount, so a price of ₦5.50 (550 kobo) cannot be charged faithfully through this endpoint. Validate this on product create.
- **Never store a float.** Keep kobo as an integer everywhere in the database. Divide only at the boundary above.

## Environment Variables

```
FLW_PUBLIC_KEY        Safe to expose. Only if we ever embed a Flutterwave widget.
FLW_SECRET_KEY        Server-only. Authenticates our calls to the Flutterwave API.
FLW_SECRET_HASH       Server-only. Verifies that incoming webhooks are from Flutterwave.
```

These names are fixed by `AGENTS.md` and by Flutterwave's own documentation. Do not rename them and do not invent variants such as `FLUTTERWAVE_SECRET_KEY`. `FLW_SECRET_KEY` and `FLW_SECRET_HASH` must never appear in client-side code.

Get the keys from the Flutterwave dashboard. Use test keys in development and live keys in production. The secret hash is a value **you** set in the Flutterwave dashboard under Settings → Webhooks: pick a long random string and paste the same value into the dashboard and `.env.local`. Flutterwave lets you set a different hash for test and live, so keep them straight.

## Creating a Payment Link

When a buyer hits "Pay Now," we create a pending Order and request a payment link. The endpoint is `https://api.flutterwave.com/v3/payments`. We POST a JSON body:

```json
{
  "tx_ref": "sellsnap_<ORDER_ID>_<RANDOM>",
  "amount": 5000,
  "currency": "NGN",
  "redirect_url": "https://sellsnap.app/p/<slug>/success?tx_ref=<tx_ref>",
  "customer": {
    "email": "buyer@example.com",
    "name": "Buyer Name"
  },
  "customizations": {
    "title": "<Seller business name>",
    "description": "<Product name>",
    "logo": "https://sellsnap.app/logo.png"
  },
  "meta": {
    "order_id": "<ORDER_ID>",
    "product_id": "<PRODUCT_ID>",
    "seller_id": "<SELLER_ID>"
  }
}
```

With the header `Authorization: Bearer ${FLW_SECRET_KEY}` and `Content-Type: application/json`.

Notes:
- `tx_ref` is **our** `Order.transactionReference`. It must be unique per Order. See the next section for its lifecycle.
- `amount` is in **naira** here. `Math.round(order.amount / 100)`. Read the unit boundary section again if you are unsure.
- `currency` is always `NGN`. It is not stored on the Order; treat it as a launch constant.
- `customer.email` is **required** by Flutterwave. If `Order.buyerEmail` is null, fail before calling the API rather than sending an empty string.
- `meta` comes back in the webhook and in the verify response, which makes reconciliation easier.
- `redirect_url` carries `tx_ref` so the success page can show "verifying your payment" while the webhook lands. It is a display-only hint.

The response looks like:

```json
{
  "status": "success",
  "message": "Hosted Link",
  "data": { "link": "https://checkout.flutterwave.com/v3/hosted/pay/..." }
}
```

Return `data.link` to the browser and redirect the buyer there. A reference implementation is in `resources/create-payment-link.ts`.

### The `tx_ref` Lifecycle

`Order.transactionReference` is `@unique` and holds exactly one value for the life of the Order. That single-column constraint dictates the design:

- **Generate `tx_ref` once, when the Order is created.** It is immutable from that point on.
- **Never regenerate it on retry.** If you mint a fresh `tx_ref` for a second payment attempt on the same Order, you overwrite the stored value. Any late webhook from the first attempt then fails the `tx_ref` equality check during verification and the order silently never settles. This is the bug this rule prevents.
- **A retry means a new Order.** If a buyer abandons or fails a payment, create a fresh Order for the retry. Do not reuse the row.

## Verifying a Transaction

After receiving a webhook, call the verify endpoint to confirm the payload is real. Do not trust the webhook body alone, even after the signature check.

```
GET https://api.flutterwave.com/v3/transactions/{transaction_id}/verify
Authorization: Bearer ${FLW_SECRET_KEY}
```

The transaction id is `payload.data.id` from the webhook, not the `tx_ref`. The response includes the transaction's real status, amount, currency, and `tx_ref`. Mark the order paid only if **all four** match:

1. `data.status === 'successful'`
2. `data.currency === 'NGN'` — compare against the constant, not `order.currency`, which does not exist on the model
3. `data.amount === Math.round(order.amount / 100)` — Flutterwave reports **naira** here too, so this is the one place you divide back down
4. `data.tx_ref === order.transactionReference`

If any check fails, log a warning and do not mark the order paid. Respond 200 to the webhook anyway so Flutterwave does not keep retrying a payload we have already judged bad. If `status` is `failed`, mark the Order `failed`.

## Webhook Handling

The handler lives at `app/api/webhooks/flutterwave/route.ts`. See `resources/webhook-handler.ts` in this skill folder for a reference implementation. Copy it into the project and adapt to the current Prisma schema; do not reinvent it.

The handler must:

1. **Check `verif-hash`.** The header must be present and equal `FLW_SECRET_HASH`. Compare with a timing-safe comparison. Reject with 401 if it does not match. (Flutterwave also offers an HMAC-SHA256 `flutterwave-signature` header, which is stronger. `AGENTS.md` specifies the secret-hash scheme, so use `verif-hash` unless we deliberately migrate.)
2. **Validate the payload with zod.** It arrived over the public internet. Never trust its shape.
3. **Filter on `payload.type`.** Flutterwave sends `charge.completed`, `charge.failed`, `transfer.completed`, `refund.completed`, `chargeback.created`, and others. Act only on `charge.completed` (mark paid) and `charge.failed` (mark failed). Acknowledge everything else with 200 and do nothing. Skipping this step means settlement depends on events that never fire for us.
4. **Find the Order by `transactionReference`** — the webhook's `tx_ref`. If no Order matches, log and return 200. Do not create Orders from webhook payloads.
5. **Return early if the Order is already `paid`.** This is the cheap idempotency guard, and it also skips the outbound API call on Flutterwave's retries.
6. **Call the verify endpoint** with `payload.data.id` and apply the four checks above.
7. **Write the result in a single transaction:** update the Order status, and create the `Payment` row with `gatewayReference` set to Flutterwave's transaction id and `paidAt`.
8. **Catch the duplicate and return 200.** See the idempotency section.
9. **Respond 200 quickly.** Email and seller notifications go in a background job after the transaction commits, never inside the webhook response path. A slow handler gets retried, and retries on a committed order are how double-send bugs happen.

## Idempotency

Webhooks get retried. Retries must be no-ops. Do not implement this with application-level locking; the database is the source of truth.

The schema already gives us three real unique constraints. Use them:

| Constraint | Protects against |
|---|---|
| `Order.transactionReference` `@unique` | Two Orders claiming the same `tx_ref` |
| `Payment.orderId` `@unique` | Two Payments attached to one Order |
| `Payment.gatewayReference` `@unique` | The same gateway transaction attached to two Orders |

So the handler has two layers:

- **Fast path:** if the Order is already `paid`, return 200 before doing any work.
- **Hard guarantee:** `payment.create()` inside the transaction. If a Payment already exists for that Order, Prisma throws `P2002`. Catch it, log a warning, and return 200 without re-applying the status change.

```ts
import { Prisma } from '@prisma/client';

if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
  logger.warn('webhooks.flutterwave.duplicate', { orderId });
  return NextResponse.json({ ok: true, data: { status: 'already_processed' } }, { status: 200 });
}
```

**Schema hardening:** `Payment.gatewayReference` is `@unique`. That closes the gap where the same Flutterwave transaction could be attached to two different Orders. It is a third idempotency layer, not a replacement for the fast-path check or the `P2002` catch on `Payment.orderId`.

## Reconciling Missed Webhooks

Webhook delivery is not guaranteed. A deploy, a timeout, or a transient 5xx can drop an event, and the Order stays `pending` forever.

Flutterwave's own guidance is to poll. Add a background job that runs roughly hourly and, for each Order still `pending` and older than ~15 minutes, calls the verify endpoint by `transactionReference` and settles it if the charge actually succeeded. Do not build this into the request path.

## Testing

Use test keys and verify end-to-end before shipping any payment change. The bug is almost always in the integration, not in the logic you unit tested.

Test cards from Flutterwave's sandbox:

| Scenario | Card | CVV | Expiry | PIN | OTP |
|---|---|---|---|---|---|
| 3D Secure success (Visa) | `4187427415564246` | `828` | `09/32` | `3310` | `12345` |
| PIN auth success (Mastercard) | `5531886652142950` | `564` | `09/32` | `3310` | `12345` |

The checkout page prompts for CVV and expiry, so you need all five values — a card number alone will not get you through the flow.

Keep test amounts at ₦100 or more so you stay clear of per-method minimums.

To exercise **failure** paths, do not invent a card number. Use the sandbox's `X-Scenario-Key` header to simulate an issuer response:

```
X-Scenario-Key: scenario:auth_pin&issuer:do_not_honor
```

Useful issuer values: `approved`, `do_not_honor`, `incorrect_pin`, `insufficient_funds`, `expired_card`. Note this header applies to the Direct Charges sandbox API (`/charges`), not to the hosted checkout link flow, so hosted-link failure testing is limited — cover those paths with unit tests plus a manual sandbox run instead.

## Common Mistakes

- **Sending kobo to Flutterwave.** This is the big one. Charge `order.amount / 100`, in naira.
- **Storing amounts as floats.** Stay in integer kobo in the database.
- **Regenerating `tx_ref` on retry.** Overwrites the stored reference and strands the first attempt's webhook.
- **Trusting the browser redirect.** The redirect is not proof of payment.
- **Skipping the verify API call.** The signature check proves the request carried your secret hash; verify proves the transaction exists and succeeded.
- **Not filtering on `payload.type`.** You will 200 out events you never handled and never settle.
- **Forgetting idempotency.** Flutterwave retries. Duplicates must be no-ops. Rely on the `@unique` constraints, not locks.
- **Blocking on email inside the webhook.** Respond fast, enqueue the rest.
- **Having no reconciliation job.** One dropped webhook is one seller who never gets paid.
- **Logging the secret key or the raw webhook body.** Strip sensitive fields before logging.
- **Using Paystack patterns.** SellSnap is on Flutterwave. Ignore anything in old PRDs or references that say Paystack.

## Resources in This Skill

- `resources/webhook-handler.ts` — reference webhook route handler with verification, event filtering, and idempotency. Copy and adapt to the current schema.
- `resources/create-payment-link.ts` — reference implementation of Order creation plus the Flutterwave payment-link call, including the kobo-to-naira conversion and `tx_ref` generation.