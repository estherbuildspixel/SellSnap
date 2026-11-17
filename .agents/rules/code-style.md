---
trigger: always_on
---

# Code Style Rules

These are the code-style rules for SellSnap. They exist so the codebase reads the same way no matter who (or which agent) wrote a given file. Consistency matters more than personal preference.

## Document Precedence

This file owns naming, formatting, and file organization — nothing else. `architecture.md` owns structure and cross-cutting patterns, `design-system.md` owns styling method and tokens, `.agents/skills/*` own their domain specifics, and `AGENTS.md` is the product brief.

When another document contradicts a rule here, do not silently pick one: flag the conflict to the developer. The registry of known conflicts lives in `architecture.md` — add to it rather than resolving a conflict privately.

## Language

TypeScript everywhere. No JavaScript files in `app/`, `components/`, or `lib/`. Configuration files such as `next.config.mjs` are the exception.

Strict mode is on. Do not disable `strict`, `noImplicitAny`, or `strictNullChecks` to make an error go away. Fix the type instead.

## Naming

- Components are `PascalCase` in `PascalCase.tsx` files. `ProductCard.tsx` exports `ProductCard`.
- Exports are named, never default: `export function ProductCard(...)`. Default exports make renames harder and break tooling; the components-builder skill requires named exports for components.
- Hooks start with `use` and live in `hooks/` or alongside the component that uses them if scoped.
- Utility functions are `camelCase` in `camelCase.ts` files.
- Constants are `SCREAMING_SNAKE_CASE` when they represent fixed configuration values, `camelCase` otherwise.
- Database models in Prisma are `PascalCase` singular: `User`, `Product`, `Order`, `Payment`. Fields are `camelCase` and map to identically named columns — the schema has no `@map` annotations, so raw SQL quotes `"transactionReference"`, never `transaction_reference`. Do not add `@map` for naming taste; a column rename costs a migration (see the db-migration-runner skill).
- Boolean variables read as yes/no questions: `isLoading`, `hasError`, `canPublish`, not `loading`, `error`, `publish`.

## File Organization

One component per file. If a helper function is only used inside one component, define it in the same file below the component. If it gets used anywhere else, lift it to `lib/`.

Order inside a component file:
1. Imports (React first, third-party next, local last, separated by blank lines)
2. Types and interfaces
3. Constants
4. The component itself
5. Helper functions used only by this component

## TypeScript

Prefer `type` over `interface` unless you need declaration merging. Keep types close to where they are used. When a type is shared across the app, put it in `lib/types.ts` or a domain-specific types file.

Do not use `any`. If you genuinely do not know the shape of something, use `unknown` and narrow it with a type guard. `any` is a last resort and should have a comment explaining why.

Use zod for anything that comes from outside the app: form inputs, API request bodies, webhook payloads, environment variables. Do not trust the compiler's types at these boundaries, because the data comes from outside TypeScript's reach.

## React

Write function components, not class components. Use hooks. Destructure props in the function signature. Give every component an explicit return type only when it improves clarity; most of the time inference is fine.

Server components are the default. Add `"use client"` only when the component actually needs interactivity, browser APIs, or client state. If a component is marked `"use client"` but has no `useState`, `useEffect`, `onClick`, or browser-only code, it should not be a client component. When it is genuinely needed, the directive goes on the first line of the file.

Keep components small. If a component file is longer than about 200 lines, look for pieces to extract.

## Formatting

These are the rules. The tooling that will eventually enforce them does not exist yet.

- Two-space indentation, single quotes for strings, semicolons required, trailing commas where valid.
- Imports are sorted: Node built-ins, then third-party packages, then local imports (aliased with `@/`), with a blank line between each group.

There is no `package.json`, no Prettier config, and no ESLint config in the repo today, so apply the rules above by hand. Do not create them yourself — installing and configuring tooling is a developer decision, like any other dependency (see What Not to Do).

## Comments

Write comments that explain *why*, not *what*. The code already says what it does. If a comment is paraphrasing the line below it, delete it.

Good comment: `// Flutterwave occasionally sends the webhook twice for the same tx; the unique constraint on transactionReference is the safety net.`

Bad comment: `// Increment the counter.`

JSDoc blocks are worth writing for public utility functions in `lib/`, especially anything related to payments, auth, or validation. For internal components, the types usually tell the story.

## Error Handling

Use try/catch around anything that can throw: database calls, network calls, JSON parsing. Catch the error, log it with enough context to debug, and return the structured error response defined in `architecture.md`.

Never swallow errors silently. A bare `catch (e) {}` with no log and no rethrow is a bug waiting to happen.

Never expose raw error messages to the end user. They may contain stack traces, file paths, or database details that should not leak.

## Async Code

Prefer `async`/`await` over `.then()` chains. It reads better and makes error handling cleaner.

Do not fire off a promise without awaiting it unless you mean to. If you are intentionally running something in the background, add a comment saying so.

## Imports

Use the `@/` alias for local imports. `import { Button } from '@/components/ui/Button'`, not `import { Button } from '../../../components/ui/Button'`.

Do not import from `app/` into `components/` or `lib/`. Dependencies flow one way: `lib` is the foundation, `components` sits on top of `lib`, and `app` sits on top of both.

## Styling

Styling method and tokens are owned by `design-system.md` and the components-builder skill. This section covers only how style code is organized:

- Each component's styles live in `ComponentName.module.css` beside `ComponentName.tsx`. One pair per component.
- Colors and typography come from CSS custom properties in `tokens/tokens.css`, written as `var(--…)`. Never a hex value, an `hsl()` literal, or a px font size. Check `design-system.md` before inventing a value.
- No Tailwind, no styled-components, no inline `style={{}}` except genuinely dynamic values that CSS cannot express.
- Class names inside a module are `camelCase`.
- When a style pattern repeats inside one file, share it with CSS Modules `composes`. When the repetition is structural, extract a component. Do not solve it with utility classes.

Do not create a Tailwind config, a Prettier Tailwind plugin, or utility-class scaffolding of any kind — that stack is not installed and not wanted.

## What Not to Do

- Do not add Lodash. Modern JavaScript handles most of what people used Lodash for.
- Do not add Moment. `date-fns` is the approved replacement for date handling, but it is still a dependency — discuss it before installing (last rule below).
- Do not add a component library (MUI, Chakra, Ant). We build our own primitives with CSS Modules and follow `design-system.md`.
- Do not leave `console.log` calls in committed code. Use the logger in `lib/logger.ts`.
- Do not add dependencies without discussing with the developer. Every dependency is a long-term cost, including formatting and lint tooling.
