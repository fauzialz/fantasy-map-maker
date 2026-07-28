# map.byfauzi.com — Frontend Styling Spec v1

How the **DOM UI** (toolbar, rails, panels, modals, sliders — the chrome *around* the
Konva canvas) is styled. The canvas itself is drawn by react-konva (ADR-03); this doc
is about everything that is HTML/CSS. Decision recorded in ADR-24.

> ⚠️ **Two v4 facts to confirm against the live Tailwind docs before relying on them**
> (they were unreachable when this was written): (1) whether `prefix(mbf)` attaches to
> per-layer imports when Preflight is split out (library build); (2) whether v4 supports
> selector-scoped `important`. Neither is load-bearing — the isolation works without
> them. Verify, don't assume.

## Stack

| Concern | Choice |
|---|---|
| CSS engine | **Tailwind CSS v4** (CSS-first config — usually **no `tailwind.config.js`**) |
| Component styles | **`tailwind-variants` (tv)** — typed variant APIs, one place per component |
| Accessible primitives | **Radix UI** (dialog, slider, dropdown-menu, tooltip, toggle, popover, context-menu), styled with our tokens |
| Chrome icons | **Lucide** (tree-shakeable, MIT) — *separate from the map's bespoke SVG sprites* |
| Tokens / theming | **CSS custom properties** (light/dark), consumed by Tailwind via `@theme inline` |
| Fonts | **self-hosted** (no CDN, CSP-safe) |
| Prefix | **`mbf:`** from day one (ADR-24) |

## Design tokens (the source of truth)

Tokens are **CSS custom properties**, defined once, flipped by `[data-theme]` and OS
preference. They drive **both** the Tailwind UI **and** the canvas SVG (one switch
recolors everything). Starting palette = the ink-on-parchment identity from
`ux-wireframe.html`.

```css
:root{
  --ground:#EEF1EC; --panel:#FBFCFA; --panel-2:#F2F5F0; --sink:#E7ECE5;
  --ink:#1C2A27; --muted:#5E6D68; --line:#D6DDD6; --line-strong:#C3CCC3;
  --accent:#22685B; --accent-ink:#164439;
  --note:#9C6414;                 /* semantic: annotations / caution — NOT the accent */
  --sea:#3E6E75; --land:#E7DAC0; --ring:#245E52;   /* canvas map colors */
}
:root[data-theme="dark"]{
  --ground:#0F1618; --panel:#18201F; --panel-2:#1D2624; --sink:#131A19;
  --ink:#E6ECE9; --muted:#94A29D; --line:#2A3533; --line-strong:#37433F;
  --accent:#54B49C; --accent-ink:#9FE3D0;
  --note:#D2A24E;
  --sea:#1F4249; --land:#C6B78E; --ring:#5AC0A8;
}
@media (prefers-color-scheme:dark){
  :root:not([data-theme="light"]){ /* same dark values as above */ }
}
```
Semantic status colors (good / warning / critical) are a **separate** small set, not the
accent.

## Tailwind v4 wiring

### App build (byfauzi.com deployment — Preflight ON)
```css
@import "tailwindcss" prefix(mbf);

/* map Tailwind's color tokens to our CSS variables — `inline` keeps them as
   var() so runtime [data-theme] switching recolors utilities live */
@theme inline{
  --color-ground:var(--ground); --color-panel:var(--panel); --color-panel-2:var(--panel-2);
  --color-ink:var(--ink); --color-muted:var(--muted); --color-line:var(--line);
  --color-accent:var(--accent); --color-accent-ink:var(--accent-ink); --color-note:var(--note);
  --color-sea:var(--sea); --color-land:var(--land); --color-ring:var(--ring);
  --font-ui:"Inter",system-ui,sans-serif;
  --font-display:"Iowan Old Style",Palatino,Georgia,serif;
  --font-mono:"JetBrains Mono",ui-monospace,monospace;
}

/* dark handled by the tokens above; declare the variant for the few non-color cases */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```
Usage: `mbf:flex mbf:bg-panel mbf:text-ink mbf:gap-2`, `mbf:hover:bg-accent`,
`mbf:dark:…` (rarely needed — color flips via the vars).

### Library build (`@byfauzi/map-editor` — Preflight OFF)
Split the import and **omit `preflight.css`** so the package never resets a host app's
page (see "Isolation" below):
```css
@layer theme, components, utilities;
@import "tailwindcss/theme.css"     layer(theme);      /* prefix(mbf) — see ⚠️ verify #1 */
@import "tailwindcss/utilities.css" layer(utilities);
/* NO  @import "tailwindcss/preflight.css"  — intentionally excluded */
```
Everything the components need is styled explicitly (no reliance on Preflight's reset).

## Component styles via `tailwind-variants`

Keep the prefixed, verbose class strings **inside one `tv()` per component**, not
scattered in JSX. Example — a toolbar tool button:

```ts
import { tv } from "tailwind-variants";

export const toolButton = tv({
  base: "mbf:inline-flex mbf:items-center mbf:gap-1.5 mbf:rounded-lg mbf:px-2.5 mbf:py-1.5 " +
        "mbf:text-sm mbf:border mbf:border-transparent mbf:transition-colors",
  variants: {
    active: {
      true:  "mbf:bg-accent/12 mbf:text-accent-ink mbf:border-accent/40",
      false: "mbf:text-ink hover:mbf:bg-panel-2",
    },
    size: { sm: "mbf:text-xs mbf:px-2", md: "" },
  },
  defaultVariants: { active: false, size: "md" },
});
// <button className={toolButton({ active })}>…</button>
```
When the library prefix is added/changed, it's contained to these `tv` files.

## Primitive inventory (Radix, styled with tokens)

| UI need | Radix primitive |
|---|---|
| Generate-confirm, export dialog | `Dialog` |
| Brush size, coast detail, ring count | `Slider` |
| Parchment / rings toggles, layer visibility | `Switch` / `Toggle` |
| Icon palette, layer overflow menu | `DropdownMenu` |
| Tool hints, control labels | `Tooltip` |
| Advanced generator drawer | `Popover` / `Collapsible` |
| Canvas right-click actions | `ContextMenu` |

## Fonts (self-hosted, `@font-face` — no CDN)

| Role | Face | Used for |
|---|---|---|
| UI sans | **Inter** (or system-ui) | all chrome |
| Display serif | **Iowan Old Style / Palatino / Georgia** class | headings, empty-states |
| Mono | **JetBrains Mono** (or ui-monospace) | coords, counts, keys |
| **Map label** | **Cinzel** or **IM Fell English** | default in-canvas place labels (a map asset, not UI) |

Ship font files with the app/library; never link a font CDN (CSP + silent-fallback risk).

## Library isolation (P3) — the stance

- **Our classes → host app:** solved by **`prefix(mbf)`** (no class-name collisions) +
  **Preflight disabled** in the library build (no global reset leak).
- **Host globals → our subtree** (a host's `button{}`, `*{}` resets touching our DOM):
  **documented limitation for v1.** Mitigate by wrapping the editor in a **`.mbf-root`**
  container and shipping a **small scoped reset** for our own elements.
- **Full isolation** (if ever needed): **Shadow DOM** — *deferred to P3*. The **P1 iframe
  embed** already gives complete isolation for the read-only viewer.

## Icons vs map sprites — don't confuse them

- **Lucide** = UI chrome only (toolbar, panels, menus).
- **Mountains / trees / landmarks / compass** on the map = **bespoke hand-drawn SVG
  sprites** in the app's asset/sprite registry (see `01-system-design.md` §9). Never
  from an icon font.

## Pre-implementation checklist

- [ ] Confirm the two ⚠️ v4 facts against the live docs (prefix on split imports;
  scoped `important`).
- [ ] Tokens defined once; `[data-theme]` + `prefers-color-scheme` both flip them.
- [ ] `@theme inline` maps colors to the vars (utilities recolor at runtime).
- [ ] `mbf:` prefix applied; component classes live in `tailwind-variants`.
- [ ] Library build excludes `preflight.css`; editor wrapped in `.mbf-root`.
- [ ] Fonts self-hosted; no CDN links anywhere.
