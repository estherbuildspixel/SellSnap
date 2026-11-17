---
name: db-migration-runner
description: >-
  Step-by-step workflow for changing the Prisma schema in SellSnap, including
  migration generation, reviewing generated SQL, zero-downtime column changes,
  backfills, deploy, drift recovery, and rollback.
---

# Database Migration Runner Skill

Load this skill when changing the database schema: adding a model, adding or removing a column, adding an index or unique constraint, renaming something, or backfilling data. Migrations are the hardest change to undo and the easiest one to take the app down with. Treat every schema change as a serious commit.

## Before You Start

- Read the data models and "Key Business Rules" in `AGENTS.md`. That file is the source of truth for column names and units. This skill defers to it.
- Read `.agents/rules/security.md` for the rules on secrets, authorization, uploads, and incident response.
- Confirm `prisma/schema.prisma` and `prisma/migrations/` exist before assuming they do. This project is early; the schema may not exist yet.
- Migrations only work if the project is under version control. If there is no `.git`, that is the first thing to fix, not the last.

## The Stack

PostgreSQL with Prisma. Schema at `prisma/schema.prisma`, migrations at `prisma/migrations/`, one timestamped directory per migration containing `migration.sql`. The Prisma Client is imported from `lib/db.ts`.

Two facts about client generation that matter and are commonly gotten wrong:

- `npx prisma migrate dev` generates the client as a side effect.
- `npx prisma migrate deploy` does **not**. After a production deploy you must run `npx prisma generate` yourself, or the running app is using a stale client that does not know about your new column.

See "Environments" for how this works on Vercel.

## The Workflow

1. Edit `prisma/schema.prisma`.
2. Run `npx prisma migrate dev --name <descriptive_name>` to generate and apply the migration locally.
3. Read the generated `prisma/migrations/<timestamp>_<name>/migration.sql` end to end. Do not skip this. Prisma is usually right, but "usually" is not "always."
4. If the generated SQL is wrong, fix it. See "Fixing Generated SQL" below. Do not paper over a bad migration by editing `schema.prisma` and regenerating over the top of it.
5. Verify. Run `npx prisma migrate status` and confirm the dev database is up to date with no failed or pending migrations. Then run the app and hit the affected pages, including one page that reads the new column.
6. Commit `schema.prisma` and the generated migration directory together. The schema file alone migrates nothing.
7. Deploy. A CI step runs `npx prisma migrate deploy` against production. Never as part of `next build`.

Never edit a migration file that has already been applied anywhere. To fix a mistake, write a new migration that corrects it.

## Fixing Generated SQL

`--create-only` is the most useful flag in this workflow. It generates the migration file *without* applying it, which gives you a safe window to hand-edit the SQL.

```bash
npx prisma migrate dev --name <descriptive_name> --create-only
# edit prisma/migrations/<timestamp>_<descriptive_name>/migration.sql
npx prisma migrate dev
```

Use it whenever Prisma's generated SQL does the wrong thing: destructive renames, a lock you cannot afford, a backfill, an index you want built concurrently.

## Naming

Migrations are named in snake_case, describing the change:

- `add_unique_slug_to_product`
- `add_payment_gateway_reference_index`
- `add_order_status_backfill`

The name is part of the migration directory, so it is permanent and it is what you read when debugging six months later. `update_schema` and `fix_stuff` tell you nothing. Upstream Prisma docs use kebab-case; either is fine, just pick one and stay consistent.

## Common Schema Patterns

### Adding a nullable column (safe)

```prisma
model Product {
  // ...
  archivedAt DateTime?
}
```

Additive and safe. Existing rows get `NULL`. No backfill needed.

### Adding a non-nullable column (careful)

You cannot add a `NOT NULL` column to a table that has rows unless the value can be derived. This is three steps, not one, and step 2 is not a migration:

1. Migration: add the column as nullable.
2. Backfill existing rows, via a versioned script (see "Data Migrations").
3. Verify zero NULLs remain before continuing:

```sql
SELECT count(*) FROM "Product" WHERE "archivedAt" IS NULL;
```

4. Migration: make the field required in `schema.prisma` and generate the migration that issues `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL`.

`SET NOT NULL` takes an `ACCESS EXCLUSIVE` lock and scans the whole table to prove no NULLs are left. On a small table that is instant. Check the count first rather than assuming.

A column added as `NOT NULL DEFAULT <constant>` does not need any of this on PostgreSQL 11 or newer, which adds it without rewriting the table. That is the exception to the rule above, not the general case.

### Adding a unique constraint

Unique constraints are how we prevent duplicate product slugs and duplicate payment references. They are the idempotency safety net, so they matter more than ordinary columns.

```prisma
model Payment {
  // ...
  gatewayReference String @unique
}
```

Adding `@unique` to a column that already has data will fail if duplicates exist. Check first:

```sql
SELECT "gatewayReference", count(*) FROM "Payment"
GROUP BY "gatewayReference" HAVING count(*) > 1;
```

If duplicates come back, you need a dedupe migration (decide which row wins, delete or merge the rest) *before* the constraint migration. Do not try to add the constraint and fix it later.

### Adding an index

Add an index when a specific query gets slow as the table grows. Not speculatively. Every index costs write throughput and storage, and this app is write-heavy on the order path.

```prisma
model Order {
  // ...
  createdAt DateTime @default(now())
  @@index([createdAt])
}
```

`Order.transactionReference` and `Order.productId` are both worth indexing under the current model. `transactionReference` is already `@unique`, which Postgres backs with an index.

On a large table, a plain `CREATE INDEX` takes a lock that blocks writes for the duration. Use `CREATE INDEX CONCURRENTLY`, which cannot run inside a transaction. If Prisma's migration transaction rejects it, apply the index outside Prisma and record it with `npx prisma migrate resolve --applied <migration>` so your migration history stays accurate.

### Renaming a column

By default Prisma generates a migration that creates the new column and drops the old one, which loses the data. Rename it properly instead:

```bash
npx prisma migrate dev --name rename_price_to_amount --create-only
```

Then replace the `DROP COLUMN` / `ADD COLUMN` pair in `migration.sql` with a single statement:

```sql
ALTER TABLE "Product" RENAME COLUMN "price" TO "amount";
```

```bash
npx prisma migrate dev
```

Instant, lossless, no application deploy in between. The same technique applies to renaming a model: replace drop-and-recreate with `ALTER TABLE "old" RENAME TO "new"`.

Reach for the expand-contract pattern below only when a rename cannot preserve data, for example when you are also changing the type or splitting one column into two.

## Data Migrations

Schema and data are different problems. Prisma handles schema; backfills and transforms are ordinary code.

Write a one-off script in `scripts/` that uses the Prisma client from `lib/db.ts`, and run it manually or from a deploy hook. Make it idempotent and safe to re-run, because you will end up running it twice.

```bash
npx tsx scripts/backfill-archived-at.ts
```

Keep the script in version control next to the migration that motivated it. Once it has run everywhere, delete it in a follow-up commit.

Never run ad-hoc SQL against production. Anything that touches production data goes through a versioned, reviewed script.

Note: `scripts/` is not yet in the project tree described in `AGENTS.md`. Create it when you first need it, and update that file so the structure stays accurate.

## Environments

**Development:** `npx prisma migrate dev` generates and applies migrations, and can reset the database if you confirm the prompt. Never point it at production or at any shared database.

**Production:** `npx prisma migrate deploy` applies pending migrations with no prompt and cannot reset anything. That is why it is the safe one.

The two are not interchangeable. Run `migrate deploy` from a CI job that has `DATABASE_URL` set from a secret:

```yaml
- name: Apply pending migrations
  run: npx prisma migrate deploy
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

Do not run `migrate deploy` inside a Vercel build command. Vercel prunes devDependencies during the build, which removes the Prisma CLI and makes the command unavailable. It also runs concurrent builds, so multiple deploys could race the same migrations.

**Vercel specifics.** Because `migrate deploy` does not generate the client, and Vercel caches dependencies so the Prisma postinstall hook does not re-run, add this to `package.json`:

```json
{
  "scripts": {
    "postinstall": "prisma generate",
    "vercel-build": "prisma generate && next build"
  }
}
```

If your Postgres provider gives you a pooled connection string, add a separate direct URL for migrations. Poolers do not support the long-lived connection Prisma Migrate needs:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

## When Production Breaks

If `migrate deploy` fails in production, do not guess and do not re-run it blindly. Work through this:

```bash
npx prisma migrate status              # what is applied, pending, or failed
npx prisma migrate diff                # does the database match schema.prisma
```

The usual cases:

- **A migration failed partway.** Postgres leaves the failed migration recorded in `_prisma_migrations`. Inspect the database, decide whether the partial state is acceptable, then either mark it applied or roll it back:

```bash
npx prisma migrate resolve --applied <timestamp>_<name>
npx prisma migrate resolve --rolled-back <timestamp>_<name>
```

- **Production has schema the migrations do not describe** (hand-edited, or created before Migrate existed). Do not run `migrate dev` here. Diff production against the schema and write the difference as a proper migration:

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

- **Adopting Migrate on a database that already has tables.** Baseline it instead of generating an `init` migration and failing:

```bash
mkdir -p prisma/migrations/0_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/0_init/migration.sql
npx prisma migrate resolve --applied 0_init
```

Never fix drift by pointing `migrate dev` at production. It will offer to reset the database.

## Rollback

Prisma does not generate down migrations. The forward fix, a new migration that reverses the change, is the official answer.

The real safety net is the database's own recovery. Before a risky migration, confirm that point-in-time recovery or a snapshot restore is available and know roughly how long it takes. That is what you reach for when the change itself was wrong, and it is the only true rollback for a dropped column holding data.

## Expand-Contract

For changes that cannot be rolled back cleanly or applied without downtime, such as dropping a column with data, transforming money amounts, or changing a uniqueness constraint, split the change across deploys in this order:

1. Deploy application code that works against both the old and the new schema. Add what is new, change nothing that is old.
2. Run the migration.
3. Deploy application code that only uses the new schema.
4. In a later deploy, remove what is no longer used.

Never combine steps 1 and 3 in one release. The gap between them is what keeps the app running.

## Money Columns

Amounts are stored as integers in the smallest currency unit, kobo for NGN. The Prisma type is `Int`, never `Float` or `Decimal`. `Decimal` is acceptable for rates and percentages, not for amounts.

The existing columns are `Product.price` and `Order.amount`, both `Int` in kobo, per `AGENTS.md`. Leave them named that way. The unit is documented centrally, and renaming them for naming purity costs a migration and touches every read site for no correctness gain.

For a new money column, name the unit when the name is ambiguous: `amountKobo` rather than `amount`. Do not let that convention force a rename of an existing column.

Two limits worth knowing:

- `Int` tops out at 2,147,483,647 kobo, about ₦21.4 million. That is fine for a single product or order today. If SellSnap ever holds a total that large in one row, switch to `BigInt`.
- Prisma's `BigInt` maps to a JavaScript `bigint`, which `JSON.stringify` refuses to serialize. That throws in server component payloads and API responses. Converting to `BigInt` means auditing every boundary that touches that field.

## Pre-Flight Checklist

Before committing a migration:

- [ ] `prisma/schema.prisma` and the migration directory are in the same commit.
- [ ] You read every line of the generated `migration.sql`.
- [ ] No `DROP COLUMN` or `DROP TABLE` that you did not intend.
- [ ] Every new `NOT NULL` column has either a default or a completed backfill.
- [ ] Every new unique constraint was checked for existing duplicates.
- [ ] `npx prisma migrate status` reports an up-to-date database.
- [ ] You know how you would undo this before you ship it.

## Common Mistakes

- Editing a migration file after it has been applied somewhere. Always write a new one.
- Adding a non-nullable column to a table with existing rows and no default or backfill, then being surprised when it fails in production.
- Adding a `@unique` constraint without checking for existing duplicates first.
- Letting Prisma drop-and-add a renamed column and losing the data. Use `--create-only` and `RENAME COLUMN`.
- Running `prisma migrate dev` or `prisma migrate reset` against production or any shared database.
- Running `migrate deploy` in a Vercel build command, where devDependencies are pruned and the CLI may be missing.
- Assuming `migrate deploy` regenerated the Prisma Client. It did not.
- Committing a `schema.prisma` change without the generated migration file.
- Running ad-hoc SQL against production instead of a versioned script.
- Storing money as floats.
- Adding indexes speculatively. They are not free.