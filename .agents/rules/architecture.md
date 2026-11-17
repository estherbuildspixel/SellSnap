---
trigger: always_on
---

# Architecture Rules

These rules describe how SellSnap is put together. Every agent building features must follow this architecture. Do not introduce new patterns without discussing them with the developer first.

## Document Precedence

SellSnap has several authority documents. When they disagree, do not silently pick one — follow this order and flag the conflict to the developer:

- **This file** owns structure and cross-cutting patterns: directory layout, module responsibilities, the request pipeline, and error shape.
- **`.agents/skills/*`** own domain specifics for their area: payment mechanics (Flutterwave skill), component construction (components-builder), route and action shape (api-route-scaffolder), migrations (db-migration-runner). Where a skill is more specific than this file, follow the skill.
- **`design-system.md`** owns styling method and tokens. **`security.md`** owns threat-specific rules. **`code-style.md`** owns naming and file organization.
- **`AGENTS.md`** is the product brief. If it disagrees with this file on structure or naming, this file wins.

### Open conflicts — flag, do not follow the losing document

1. `AGENTS.md` shows `components/features/` and `types/index.ts`. Stale — this file's layout is current.

Delete items from this list as the underlying documents are corrected. (Resolved: `code-style.md` no longer mandates Tailwind; `security.md` env var names and its `gatewayReference` claim were corrected.)

## The Stack

SellSnap is a Next.js 15 application using the App Router, written in TypeScript in strict mode, backed by PostgreSQL through Prisma. Payments run through Flutterwave. Sessions come from NextAuth with a database session strategy. Styling is CSS Modules plus CSS custom properties from `tokens/tokens.css`, as `design-system.md` requires — Tailwind is not installed and must not be added. There is no separate backend service. Everything lives in the Next.js app, using server components, server actions, and route handlers.

## Directory Layout

```
app/
├── (marketing)/               public landing pages, logged-out experience
├── (dashboard)/               authenticated seller dashboard, grouped by layout
│   ├── products/
│   ├── orders/
│   └── settings/
├── p/
│   └── [slug]/                public product page - the shareable link target
│       └── success/           post-payment page; display only, never marks an order paid
├── api/
│   ├── auth/                  login, signup, logout route handlers
│   ├── products/              product CRUD
│   ├── orders/                order creation and status
│   ├── cron/                  scheduled jobs (payment reconciliation), secret-protected
│   └── webhooks/
│       └── flutterwave/       Flutterwave webhook receiver
└── layout.tsx                 root layout

components/
├── ui/                        primitives (Button, Input, Card, Badge, Avatar)
├── product/                   product domain (ProductCard, PriceTag, ProductImage)
├── dashboard/                 seller dashboard (OrdersTable, ProductList)
└── shared/                    used by more than one domain (EmptyState, PageHeader)

lib/
├── db.ts                      Prisma client singleton
├── auth.ts                    NextAuth config and getSession()
├── env.ts                     zod-validated env config; refuses to boot if incomplete
├── flutterwave.ts             Flutterwave API wrapper; the only kobo-to-naira boundary
├── logger.ts                  structured logger; attaches request ID in route context
├── rate-limit.ts              checkRateLimit()
├── cn.ts                      class-name joiner for CSS Modules
├── storage.ts                 object storage provider for product images
├── utils.ts                   shared helpers
└── types.ts                   shared TypeScript types

hooks/                         use* hooks for client components

prisma/
├── schema.prisma              single source of truth for the database
└── migrations/                generated migration files

tokens/
└── tokens.css                 design tokens; generated, never edited by hand

public/                        static assets
```

Server actions live beside the pages that call them, in an `actions.ts` file at `app/(dashboard)/<area>/actions.ts`. Zod schemas live next to the route or action that owns them, not in a shared validators folder. Promote a schema into `lib/` only when a second caller needs it. A component used exactly once stays beside its page at `app/<route>/_components/`; promote it to `components/` when a second caller appears.

## Rendering Rules

Product pages at `/p/[slug]` must be server-rendered. They are the single most important page in the product because they are what buyers land on from WhatsApp. They must load fast, work without JavaScript enabled, produce good Open Graph previews, and be fully usable at a 375px viewport.

The seller dashboard can use client components where interactivity is needed, but data fetching happens on the server. Do not fetch from API routes inside client components when a server component can pass the data down directly.

## The Request Pipeline

Every write follows one fixed order. A later step never runs before an earlier one.

1. **Rate limit** — `checkRateLimit`. Required for anything reachable without a session: login, signup, order creation.
2. **Authenticate** — `getSession()`. `401` before `400`, so unauthenticated callers cannot probe the schema.
3. **Validate** — zod `safeParse` on body, query, and path params. All untrusted. `400` on failure.
4. **Authorize** — load the actual row, then compare `row.userId` to `session.userId`. `404` if missing, `403` if owned by someone else. Never infer ownership from the URL shape.
5. **Do the work.**
6. **Return the response envelope.**

Webhooks skip step 2: they have no session and authenticate by signature instead (see Payments below).

## Data Flow

There are three kinds of writes in this app:

1. **User-initiated writes from the dashboard** go through server actions. Form submits call a server action, the action runs the pipeline above, writes through Prisma, and revalidates the relevant cache tags before returning. Name a tag after the data read it refreshes and use the same name everywhere that data is read.
2. **Public-facing writes from the checkout** go through route handlers under `app/api/`. The product page is public, so when a buyer hits "Pay Now," the client calls a route handler which creates a pending order and returns a Flutterwave payment link.
3. **Payment confirmations** come in through the Flutterwave webhook at `app/api/webhooks/flutterwave/route.ts`. This is the only place that marks an order as paid. The success redirect in the browser is not trusted.

## Payments and Money

This is the architecture of a payments product. Treat every rule in this section as a blocker, not a preference.

**Units.** `Product.price` and `Order.amount` are integers in **kobo**. Never a float, never a string, never converted inside a route handler. Convert to naira only in `lib/flutterwave.ts` (the gateway boundary) or at the display layer (`value / 100`). Flutterwave takes an integer naira amount, so product prices must be whole naira — a multiple of 100 kobo — and this is validated on product create. Paystack-style kobo payloads are wrong here; SellSnap is on Flutterwave.

**Settlement.** The webhook handler is the only code that marks an order paid. It verifies the `verif-hash` signature, then calls Flutterwave's verify API, and only marks paid if status, currency, amount, and `tx_ref` all match. The browser redirect is a display-only hint.

**Idempotency.** Webhooks are retried and retries must be no-ops. The database is the source of truth: rely on the `@unique` constraints (`Order.transactionReference`, `Payment.orderId`), fast-path return `200` when the order is already `paid`, and catch `P2002` inside the write transaction to acknowledge duplicates. Never implement idempotency with application-level locks.

**`tx_ref`.** Generate `Order.transactionReference` once at order creation and never regenerate it. A retry means a new Order; minting a fresh `tx_ref` on the same row strands the first attempt's webhook and the order silently never settles.

**Reconciliation.** Webhook delivery is not guaranteed. See Background Jobs.

## Background Jobs

With no separate backend service, scheduled work runs as cron-triggered route handlers under `app/api/cron/`. They are protected by a secret header, never publicly reachable, must return quickly, and must never run inside the webhook response path. The first job reconciles orders still `pending` after ~15 minutes by calling the verify endpoint by `transactionReference`. Emails and seller notifications are queued after the database transaction commits — never awaited inside a webhook or cron response.

## State Management

There is no global state library. React state and server data are enough. If you feel the urge to add Redux, Zustand, or Jotai, stop and reconsider. The dashboard is simple enough that `useState` and server actions cover every case.

## Database Access

All database access goes through Prisma. The client is imported from `lib/db.ts`, which exports a singleton. Do not instantiate `new PrismaClient()` anywhere else; creating multiple clients exhausts the connection pool in development.

Every query that takes user input must be parameterized: Prisma's query builder, never string interpolation, never `$queryRawUnsafe`. If raw SQL is genuinely required, use `prisma.$queryRaw` with a tagged template, which parameterizes correctly. Free-form SQL otherwise belongs only in migration files.

## Authentication

Sessions are NextAuth with a database session strategy. Cookies are `httpOnly`, `secure` in production, and `sameSite: lax`, with a 30-day expiry. Logout deletes the session record server-side, not just the cookie, so a stolen cookie dies with it.

`lib/auth.ts` exposes `getSession()` for server components and server actions. Client components that need auth state receive it as a prop from their parent server component; they never fetch it themselves. Never build session handling from scratch alongside NextAuth — there must be exactly one session implementation.

## Error Handling and Logging

Server actions and route handlers return the same envelope: success is `{ ok: true, data }` and failure is `{ ok: false, error: { code, message } }`. The client never receives raw exception messages, stack traces, or Prisma error objects.

Log the real error on the server through `lib/logger.ts` using structured context — `logger.error('api.orders.create.failed', { orderId })`, never string concatenation and never `console.log`. Every log line carries a request ID; the logger attaches it automatically inside a route context. Return only a sanitized message to the user.

## Environments and Configuration

Environment variables live in `.env.local` in development, are validated at boot by zod in `lib/env.ts`, and the app refuses to start if a required one is missing. Only `NEXT_PUBLIC_` variables reach the browser; never put a secret behind that prefix.

Canonical names, fixed by `AGENTS.md` — do not invent variants such as `FLUTTERWAVE_SECRET_KEY`:

```
DATABASE_URL
NEXTAUTH_SECRET
NEXTAUTH_URL
FLW_PUBLIC_KEY        safe to expose
FLW_SECRET_KEY        server-only
FLW_SECRET_HASH       server-only; webhook verification
RESEND_API_KEY
STORAGE_ACCESS_KEY / STORAGE_SECRET_KEY / STORAGE_BUCKET
NEXT_PUBLIC_APP_URL
CRON_SECRET           server-only; protects app/api/cron/*
UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN   production rate limiter
ENABLE_DEV_VERIFY     development only; enables buyer-return verification
```

`FLW_SECRET_KEY` and `FLW_SECRET_HASH` must never appear in client-side code or in a log line.

There are two environments:

- `development` runs locally against a local PostgreSQL and Flutterwave test keys.
- `production` runs on the deployment target with production Flutterwave keys and the production database.

There is no staging environment yet. When we add one, it will use Flutterwave test keys against a separate production-shaped database.

## Testing

No test framework is installed or locked in yet. Confirm with the developer before adding a test runner as a dependency.

Requirements regardless of framework:

- Money conversion (kobo to naira and back), input validators, and the webhook idempotency guard get unit tests.
- Any change to payment code is verified end to end in the Flutterwave sandbox before shipping, using the test cards in the Flutterwave skill. The bug is almost always in the integration, not in the logic you unit tested.
- Webhook retry and duplicate-delivery paths are exercised, not assumed.

## What Not to Do

- Do not add GraphQL. REST route handlers and server actions are enough.
- Do not add a separate Node or Express backend. Everything stays in Next.js.
- Do not reach for microservices. This is one app.
- Do not add Tailwind, styled-components, or a component library (MUI, Chakra, Ant). CSS Modules and `tokens/tokens.css` only.
- Do not add a global state library.
- Do not mark an order paid outside the webhook handler, and never because a redirect said so.
- Do not regenerate `tx_ref` on an existing order.
- Do not store uploaded product images on the filesystem. Use the configured storage provider (`lib/storage.ts`). The filesystem is ephemeral on most deployment targets.
- Do not build a custom auth system from scratch. NextAuth is the session implementation.
- Do not add dependencies without discussing them with the developer.
