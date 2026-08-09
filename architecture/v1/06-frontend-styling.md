# map.byfauzi.com — Frontend Styling Spec v1

How the **DOM UI** (toolbar, rails, panels, modals, sliders — the chrome *around* the
Konva canvas) is styled. The canvas itself is drawn by react-konva (ADR-03); this doc
is about everything that is HTML/CSS. Decision recorded in ADR-24.

> ⚠️ **Two v4 facts to confirm against the live Tailwind docs before relying on them**
> (they were unreachable when this was written): (1) whether `prefix(mbf)` attaches to
> per-layer imports when Preflight is split out (library build); (2) whether v4 supports
> selector-scoped `important`. Neither is load-bearing — the isolation works without
> them. Verify, don't assume.
>
> **WP-13 status (built on Tailwind 4.3):** neither ⚠️ was answered, because neither came
> up — the app build uses the single `@import "tailwindcss" prefix(mbf)`, and nothing
> needed `important`. They stay open for the P3 library build, which is where the split
> import lives. What *was* verified, by driven input rather than by reading: `prefix(mbf)`
> applies to every utility in the app build, and **`@theme inline` does keep `var()`** —
> the compiled rule is `.mbf\:bg-panel{background-color:var(--panel)}`, so flipping
> `[data-theme]` at runtime recolours utilities live with no rebuild.

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

**As built (`src/styles/tokens.css`), with two changes.** The canvas colours are
namespaced **`--map-*`** and there are fifteen of them, not three: the renderer needs
paper, paper-shade, sea, sea-deep, ring, ink, coast, river, a vignette triple, five biome
fills and the sprite artwork colours. Having a bare `--sea` for the map next to `--panel`
for the chrome read as one palette when they are two — the map is a drawn artefact, the
chrome is furniture around it, and only the second should follow the room. The values are
the ones WP-5 tuned by eye, not the sketch above. Dark keeps the map a parchment chart,
dimmed and cooled so it does not glare out of a dark shell.

`canvas/palette.ts` reads them (`refreshPalette()`) and `state/themeStore.ts` drops the
caches that baked the old colours into pixels — the parchment and hatch tiles, and the
sprite rasters. Anything that caches a colour has to be on that list.
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
| The menu bar — Map · Edit · View · Help | **`Menubar`** (not `DropdownMenu`: four independent dropdowns are four dismiss layers, so switching menus costs two clicks — ADR-43's sibling correction, `11` §6) |
| Any single dropdown that is not part of a bar | `DropdownMenu` |
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
  scoped `important`). — **still open, and now P3's**: both are library-build concerns.
- [x] Tokens defined once; `[data-theme]` + `prefers-color-scheme` both flip them.
- [x] `@theme inline` maps colors to the vars (utilities recolor at runtime).
- [x] `mbf:` prefix applied; component classes live in `tailwind-variants` (`ui/variants.ts`).
- [ ] Library build excludes `preflight.css`; editor wrapped in `.mbf-root`. — **P3.**
- [x] Fonts self-hosted; no CDN links anywhere (`@fontsource*`, bundled as content-hashed
  `.woff2`). Canvas text does not wait for a webfont, so `main.tsx` forces one redraw on
  `document.fonts.ready` — otherwise the first labels are drawn, and *measured*, in the
  fallback face.
