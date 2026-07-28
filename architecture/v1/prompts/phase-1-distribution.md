# Phase 1 — Backend-Free Distribution · Agent Work Order

> **You are an AI coding agent.** Extend the Phase 0 editor so users can get their
> maps **out of the app without any backend**: a self-contained HTML embed and a
> portable project file. No server, no auth, no network.

## Required reading
- `../01-system-design.md` §11 (Export & distribution).
- `../02-scene-data-model.md` — the scene contract and `migrate()`.
- `phase-0-core-editor.md` — you are building on its export + scene modules.

## Definition of done for Phase 1
From the editor, a user can (a) **export a single self-contained `.html` file** that
renders their map (pan/zoom, read-only) on any website with no dependencies, and
(b) **export/import a `.map.json`** project file that round-trips the scene losslessly.

## Hard constraints
- **Still no backend.** Everything is client-side file generation/parsing.
- **Reuse the Phase 0 rendering core.** The embed viewer must render from the *same*
  scene JSON and the *same* derivation logic (rings, sprites) — do not fork the
  renderer. Factor a **read-only viewer** out of the editor's canvas module.
- **All imports run through `migrate(scene)`.** Reject/repair unknown schema versions
  gracefully.

## Work packages

### WP-1 · Extract a read-only viewer
- Refactor the canvas so a **`MapViewer`** (render + pan/zoom, no tools/editing) can be
  instantiated from a scene JSON alone. This is the seed of the P3 `@byfauzi/map-viewer`
  package — keep it dependency-clean and framework-thin.
- **Acceptance:** the same scene renders identically in the editor and the standalone
  viewer, including derived rings and sprites.

### WP-2 · `.map.json` export/import
- **Export:** serialize the current scene (already the save format) to a downloadable
  `.map.json`.
- **Import:** file-picker → parse → `migrate()` → load into the editor. Validate shape;
  show a clear error on malformed/incompatible files.
- **Acceptance:** export then re-import reproduces the map exactly; a corrupted file
  yields a friendly error, not a crash.

### WP-3 · Self-contained HTML embed export
- Generate a **single `.html`** with: the scene JSON inlined, the **viewer runtime
  inlined** (JS + any sprite/texture assets as data URIs), and a small bootstrap that
  mounts `MapViewer` into a full-bleed container.
- Must work **offline, from `file://`, and inside an `<iframe>`** with **no external
  requests** (respecting strict CSPs — inline everything, embed assets as data URIs).
- Provide the user a copy-paste `<iframe>` snippet pointing at their hosted file, plus
  the downloadable `.html`.
- **Acceptance:** open the exported file directly in a browser and embed it via iframe
  on a blank page — the map renders and pans/zooms with zero network calls; bundle size
  is reasonable (lazy-note: sprite atlas dominates — keep it tight).

### WP-4 · Export UI integration
- Add "Export → Embeddable HTML" and "Export → Project (.map.json)" and "Import
  project" to the existing export/menu UI from Phase 0.
- **Acceptance:** all export/import paths reachable from the UI; consistent with the
  P0 image-export dialog.

## Gotchas
- **CSP/inlining:** the embed must assume a strict Content-Security-Policy on the host
  site — no external scripts, styles, fonts, or images. Inline/base64 everything.
- **Asset weight:** rasterized sprite atlases can bloat the HTML; ship only the
  variants the scene actually uses, at a sensible resolution.
- **Version skew:** stamp the embed with `schemaVersion` and bundle the matching
  viewer so an old exported file keeps working.

## Out of scope for Phase 1
Hosted share links, live `/embed/{slug}` server routes, accounts, SVG/PDF (all P2), the
published npm packages (P3).
