---
trigger: always_on
---

# Design System Rules

These rules govern styling in SellSnap: which tokens exist, how they are used, and which values are allowed in component CSS. Every agent writing styles must follow them.

## Document Precedence

This file owns styling method, design tokens, and the spacing, radius, and responsive rules. The components-builder skill owns component construction details (file layout, variants, accessibility) and defers to this file on anything token-related. `architecture.md` owns structure; `code-style.md` owns naming and organization inside stylesheets.

When another document contradicts a rule here, do not silently pick one: flag the conflict to the developer. The registry of known conflicts lives in `architecture.md`.

## Token Files Are the Source of Truth

The project has one design token stylesheet: `tokens/tokens.css`. It exports CSS custom properties (CSS variables) that are available globally.

**It is generated.** `tokens/convert-tokens.js` builds it from `tokens/color-tokens.json` and `tokens/design-tokens.tokens.json`. Never edit `tokens.css` directly — the next regeneration overwrites your change. To change a value or add a token you need, stop and ask the developer.

## Known Broken Token Values

The token file currently contains 16 unconverted placeholder values resolving to `hsl(300, 100%, 50%)` — bright magenta. Affected: the error roles in both themes (`--color-error-color`, `--color-on-error-color`, both `error-container` pairs) and the dark-theme values for `background`, `surface`, `surface-dim`, `surface-bright`, `surface-container`, and `surface-container-{lowest,high,highest}`.

Build against these tokens anyway — the names are correct and the values will be fixed upstream. Do not treat the magenta as intended and do not hardcode a substitute. Flag it if you hit it. Remove this section once the values are converted.

## Two Token Layers: Semantic and Primitive

`tokens.css` defines two layers, and only one of them may appear in component CSS:

- **Primitive layer** — `--primitive-color-light-*` and `--primitive-color-dark-*`. The raw palette, split per theme. **Never reference these in component CSS.**
- **Semantic layer** — roles like `--color-surface-color`, `--color-on-surface-color`, `--color-primary-color`. These re-point between themes automatically.

Dark theme works by re-pointing the semantic layer only. Hardcode a color, or bind to a primitive directly, and that property stops adapting: dark theme silently breaks for it while everything else switches.

Every semantic color variable carries a `-color` suffix. If you are unsure a name exists, check `tokens.css` — an unresolvable `var()` fails silently at computed-value time, the declaration is simply discarded, and it looks like a styling bug nobody can find.

## Mandatory: Use CSS Variables, Never Raw Values

Never write a hardcoded color or typography value anywhere in this codebase. This rule covers colors and font sizes only — spacing and radius literals are allowed under their scales below.

Wrong:
```css
color: #1a1a1a;
font-size: 16px;
font-family: 'Inter', sans-serif;
color: var(--color-text-primary);   /* no such token */
background: var(--color-surface);   /* missing the -color suffix */
```

Correct:
```css
color: var(--color-on-surface-color);
background: var(--color-surface-color);
font: var(--font-body-small);
letter-spacing: var(--font-body-small-letter-spacing);
```

Before writing any style value, check `tokens.css`. If a variable exists for what you need, use it. If it does not exist, ask before inventing a new value.

## Typography

Type scales are `--font-display-*`, `--font-headline-*`, `--font-title-*`, `--font-body-*`, and `--font-label-*`, each in `large`, `medium`, and `small`. Use the `font` shorthand:

```css
.pageTitle {
  font: var(--font-title-medium);
  letter-spacing: var(--font-title-medium-letter-spacing);
}
```

`font` shorthand does **not** include `letter-spacing`. Where the token defines one, always set it from its own variable — never retype a literal like `-0.576px` when a variable holds that exact number.

Each scale token also ships longhands (`--font-body-small-font-size`, `-font-weight`, `-line-height`, `-letter-spacing`, `-font-family`). For a single property, use the longhand rather than re-deriving a value from the shorthand. Never a px font size written by hand.

## Dark Theme

If you used semantic roles, there is nothing to write. `data-theme="dark"` and `prefers-color-scheme: dark` both work already. If a color is hardcoded or a primitive is targeted, they will not — which is why both are banned above.

## Spacing Scale

Use multiples of 4px for all spacing (margin, padding, gap). Do not use arbitrary values.

Allowed: `4px`, `8px`, `12px`, `16px`, `24px`, `32px`, `48px`, `64px`

## Border Radius

The product has a consistent border radius. Use these values only:

- Small elements (badges, tags): `4px`
- Buttons and inputs: `8px`
- Cards and modals: `12px`

## Styling Method

- All component styles use CSS Modules (`.module.css` files).
- No inline `style={{}}` props except for truly dynamic values that cannot be expressed in CSS (e.g., a progress bar width driven by a number).
- No Tailwind. No styled-components. CSS Modules only.

## Mobile-First

SellSnap users are primarily on mobile. Every component must be built mobile-first:

- Default styles target mobile (small screens).
- Use `@media (min-width: 768px)` to layer in desktop styles.
- Touch targets must be a minimum of 44px tall.
- The product checkout page (`/p/[slug]`) must be fully functional on a 375px viewport.
