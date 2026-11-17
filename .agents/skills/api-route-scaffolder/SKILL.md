---
name: api-route-scaffolder
description: >-
  Exact shape every SellSnap API route and server action must follow: the
  route-handler and server-action templates, the rate-limit → auth → validate →
  authorize order, the response envelope, HTTP status codes, structured logging,
  and idempotency. Load when creating or modifying app/api/**/route.ts or a
  server action.
---

# API Route Scaffolder Skill

Load this skill when creating or modifying a Next.js route handler (`app/api/**/route.ts`) or a server action. It tells you the exact shape every route should have in SellSnap, so routes behave consistently whether they handle a login, an order creation, or a webhook.

This skill restates the rules it depends on so it stands alone. `.agents/rules/architecture.md` and `.agents/rules/security.md` are the long-term home for cross-cutting rules; if they contain guidance that conflicts with this skill, flag the conflict instead of silently picking one.

## Action or Route?

Ask first: should this be a server action or a route handler?
- **Server action** if the caller is our own dashboard UI and the action is a form submit or a UI-triggered mutation.
- **Route handler** if the caller is a public client (the product page), a third party (Flutterwave webhook), or another service.

Server actions are the default for internal writes. Route handlers are for external boundaries.

## Required Helpers

Every template below imports these. They are contracts: if one does not exist yet, create it with exactly this signature before writing the route.

| Module | Export | Signature |
|---|---|---|
| `@/lib/db` | `db` | Prisma client singleton (`lib/db.ts`) |
| `@/lib/auth` | `getSession` | `(): Promise<Session \| null>` — thin NextAuth wrapper, `null` when signed out |
| `@/lib/logger` | `logger` | `.info(event, ctx)` / `.warn` / `.error` — structured context only, auto-attaches request ID in route context |
| `@/lib/rate-limit` | `checkRateLimit` | `(key: string) => Promise<{ ok: boolean; retryAfterSec?: number }>` |

Never log or expose `FLW_SECRET_KEY` or `FLW_SECRET_HASH`.

## Route Handler Template

```ts
// app/api/<resource>/<action>/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rate-limit';

type Success<T> = { ok: true; data: T };
type Failure = { ok: false; error: { code: string; message: string } };

const fail = (status: number, code: string, message: string) =>
  NextResponse.json<Failure>({ ok: false, error: { code, message } }, { status });

const inputSchema = z.object({
  // Describe every field you expect from the client.
});

export async function POST(req: NextRequest) {
  try {
    // 1. Rate limit first. Required for every route reachable without a session.
    const limit = await checkRateLimit(`api.<resource>.<action>:${req.ip ?? 'unknown'}`);
    if (!limit.ok) {
      return NextResponse.json<Failure>(
        { ok: false, error: { code: 'rate_limited', message: 'Too many requests. Try again shortly.' } },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfterSec ?? 30) } }
      );
    }

    // 2. Authenticate. 401 before 400 so unauthenticated callers cannot probe the schema.
    const session = await getSession();
    if (!session) return fail(401, 'unauthorized', 'Please sign in.');

    // 3. Validate. Body, query, and path params all come from outside.
    const body = await req.json().catch(() => null);
    const parsed = inputSchema.safeParse(body);
    if (!parsed.success) return fail(400, 'invalid_input', 'Check your input and try again.');

    // 4. Authorize: does this user own the resource they are trying to touch?
    //    Check it explicitly against a row you actually loaded. Never infer
    //    ownership from the URL shape.
    const resource = await db.<resource>.findUnique({ where: { id: parsed.data.id } });
    if (!resource) return fail(404, 'not_found', 'Not found.');
    if (resource.userId !== session.userId) return fail(403, 'forbidden', 'You do not have access to this resource.');

    // 5. Do the work. Keep this block small; extract to lib/ if it gets long.
    const result = await /* ... */;

    // 6. Return the envelope.
    return NextResponse.json<Success<typeof result>>({ ok: true, data: result });
  } catch (error) {
    logger.error('api.<resource>.<action>.failed', { error });
    return fail(500, 'server_error', 'Something went wrong. Please try again.');
  }
}
```

The order is fixed: **rate limit → authenticate → validate → authorize → work.** Each step answers only its own status code (429 / 401 / 400 / 404-or-403 / 500), and a later check never runs before an earlier one.

### Query and Path Params

Route params arrive as strings and are just as untrusted as the body:

```ts
const params = z.object({ slug: z.string().min(1) }).safeParse(req.params);
const query = listQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
if (!params.success || !query.success) return fail(400, 'invalid_input', 'Check your input and try again.');
```

Always `safeParse`, always `400` on failure. Never pass `req.params` or search params straight into Prisma.

## The Rules

**Always validate with zod.** TypeScript types are erased at build time; zod is what actually enforces the shape at runtime.

**Always authenticate before authorizing.** Check the session exists (401), then check the session may touch this specific row (403). Authorization is always per-resource: "Can this user edit this product?" means `product.userId === session.userId`, not "is this user signed in?"

**Always return the envelope.** Success is `{ ok: true, data }`. Failure is `{ ok: false, error: { code, message } }`. The same shape in every route, every action, and every webhook response.

**Never return raw error messages.** Log the real error server-side, return a sanitized message. A Prisma error can reveal schema and query structure; a stack trace is worse.

**Use proper HTTP status codes.**
- `200` for success.
- `201` for resource creation when you want to be precise.
- `400` for validation errors (client sent garbage).
- `401` for unauthenticated (no session).
- `403` for unauthorized (session exists but lacks permission).
- `404` for resource not found (a deleted product returns `404` with `code: 'not_found'` and message `Product not available.`, never a bare Next.js 404 page).
- `409` for conflicts (duplicate slug, duplicate order).
- `429` for rate limit hits, with a `Retry-After` header.
- `500` for bugs on our side.
- `502` when an upstream dependency (Flutterwave) fails and we cannot fulfil the request.

**Rate limit every public endpoint.** Anything reachable without a session must call `checkRateLimit` first: login, signup, order creation on the product page, and any other unauthenticated write. Use a key that isolates abusers (`route:email` or `route:ip`), not one shared bucket.

**Prices are kobo.** `Product.price` and `Order.amount` are integers in kobo. Convert only at the display layer or at the Flutterwave boundary (`lib/flutterwave.ts`), never in a route handler.

**Log structured data, not strings.** `logger.info('order.created', { orderId, productId })` beats `logger.info('Created order 123 for product 456')`. Structured logs can be queried; strings can only be grep'd.

**Webhooks authenticate by signature, not session.** A Flutterwave webhook has no `getSession()`. Verify the `verif-hash` header instead, and never rate-limit it into failures or skip its 200 acknowledgements. `.agents/skills/flutterwave-integration/SKILL.md` owns that pattern — read it before writing any webhook route.

## Server Action Template

```ts
// app/(dashboard)/<area>/actions.ts

'use server';

import { z } from 'zod';
import { revalidateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getSession } from '@/lib/auth';

type ActionResult =
  | { ok: true; data?: unknown }
  | { ok: false; error: { code: string; message: string } };

const inputSchema = z.object({
  // ...
});

export async function createSomething(formData: FormData): Promise<ActionResult> {
  try {
    // Authenticate first, same order as routes.
    const session = await getSession();
    if (!session) {
      return { ok: false, error: { code: 'unauthorized', message: 'Please sign in.' } };
    }

    const parsed = inputSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) {
      return { ok: false, error: { code: 'invalid_input', message: 'Please check your entries.' } };
    }

    // For update/delete actions, load the row and check ownership here:
    // if (row.userId !== session.userId) return { ok: false, error: { code: 'forbidden', ... } };
    const created = await db.something.create({
      data: { ...parsed.data, userId: session.userId },
    });

    revalidateTag('somethings');
    return { ok: true, data: created };
  } catch (error) {
    logger.error('action.create_something.failed', { error });
    return { ok: false, error: { code: 'server_error', message: 'Something went wrong.' } };
  }
}
```

Action rules:
- Set `userId` from the session, never from `formData`.
- Mutations invalidate cache before returning. Name tags after the data read they refresh (the product list page reads `products`, so the tag is `products`) and use the same tag name everywhere it is read, or the cache will serve stale data.
- Actions that redirect on success do so at the very end with `redirect(...)`. `redirect()` throws — never put it inside a `try` block whose `catch` returns an error envelope, or the redirect is swallowed.
- Actions that return data let the caller handle the response.

## Idempotency

Any route that creates something paid for must be idempotent. See `.agents/skills/flutterwave-integration/SKILL.md` for the pattern using unique constraints (`transactionReference @unique` plus a duplicate check before confirming). Do not implement idempotency with application-level locking; the database is the source of truth.

## Request IDs

Every log line should include a request ID so you can trace one request through the logs. The `logger` helper in `lib/logger.ts` attaches it automatically when called from a route context.

## Common Mistakes

- Skipping zod validation and trusting TypeScript. TypeScript does not run at runtime.
- Authenticating but forgetting to authorize. Any signed-in user could edit anyone else's product if you skip the ownership check.
- Returning `401` where `403` belongs (or vice versa): 401 = no session, 403 = session lacks permission.
- Skipping `checkRateLimit` on a public route because "it's just one endpoint."
- Using `GET` for a mutation. Stick to conventions: `POST` creates, `PATCH` updates, `DELETE` deletes, `GET` reads.
- Returning raw Prisma errors or exception messages to the client.
- Forgetting `revalidateTag`/`revalidatePath` after a server action mutates data, or using a tag name no page reads.
- Putting business logic inline in the route handler. If it is more than a few lines, move it to `lib/`.
- Passing unvalidated `req.params` or search params into Prisma.
- Treating a webhook like a normal route: it has no session, its auth is the signature header, and its failures still answer `200` where the Flutterwave skill says to.
