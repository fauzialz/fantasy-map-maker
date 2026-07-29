# map.byfauzi.com — P0 Build Checklist

A one-page tracker for the Phase 0 build, in **prototype-first order** (risky geometry
before polish). Each item is a work package from `prompts/phase-0-core-editor.md`; the
full instructions + acceptance criteria live there and in `04-geometry-pipeline.md`.
Check items off as they pass their acceptance criteria.

Legend: `[ ]` todo · `[~]` in progress · `[x]` done

---

## Foundation
- [x] **WP-0 · Scaffold** — Vite + React + TS; geometry libs; Web Worker protocol;
  `scene/` types + `createEmptyScene` + `migrate()` (wired everywhere) + (de)serialize.
- [x] **WP-1 · Canvas & layers** — Konva stage; clamped pan/zoom; one layer per
  semantic layer; **active-layer-live / others-cached-at-viewport-resolution** proven
  with placeholders.

## Terrain engine  *(the load-bearing wall — build stage-by-stage vs `04`)*
- [x] **WP-2 · Brush → polygon** (Pipeline A / S1–S9) — raster mask → contours →
  Chaikin → simplify(coastDetail) → assemble → union → split. **All S-fixtures pass.**
- [x] **WP-3 · Sea/eraser brush** (S8 + S9) — difference + connected-components split;
  **larger piece keeps id/name**; lake = interior hole.
- [x] **WP-4 · Coastal rings** (Pipeline C / S10–S14) — land-union → water → bands →
  clip. **The strait fixture passes.** Cached rings layer; debounced recompute; toggle.

## Styling & objects
- [x] **WP-5 · Parchment & base styling** — parchment bg, sea fill, biome fills,
  vignette; both global toggles (`parchment`, `coastalRings`) work.
- [x] **WP-6 · Mountains & forests** — sprite registry + raster cache; scatter-brush /
  one-by-one / object-eraser; z-order `(manual z, Y, scale)`.
- [x] **WP-7 · Selection & editing** — click / shift-click / marquee (rbush); transform
  handles; bring-forward/send-back; delete; smooth at 1–2k objects.
- [x] **WP-8 · Icons, rivers, labels** — icon palette (icons are sprites with a named
  variant); river spline tool (Chaikin centreline → tapering ribbon, no rings, draggable
  control points); text labels with a paper halo. Verified by driven input, 15 checks.

## Systems
- [x] **WP-9 · Undo/redo** — command stack; one stroke / scatter-drag / generate = one
  step; terrain commands store only affected-landmass before/after. Steps are per-layer
  object diffs; sliders coalesce; a new canvas is undoable as a whole-scene step (the
  shape WP-10's Generate reuses).
- [x] **WP-10 · Generator** (10a–10h) — noise fields → mask → Pipeline B → speck filter
  → biomes → mountain/forest Poisson scatter → budget cap → assemble; confirm modal;
  one undoable replace; seed = metadata only. Sea level is a **quantile** of the elevation
  field, so land amount means what it says. 25 fixtures; 4000×3000 world in ~250–420 ms.
- [ ] **WP-11 · Export** — PNG/JPG/WebP; **resolution clamp + warn**; **JPG flattens**
  onto bg.
- [ ] **WP-12 · Local-first persistence** — IndexedDB autosave/restore; maps carry
  `meta.id`; survives refresh; no scene data in localStorage.

## Ship
- [ ] **WP-13 · UI polish & deploy** — toolbar, layer panel, settings, generator panel,
  export dialog, confirm modal, toasts; deploy static SPA. A newcomer makes + exports a
  good-looking map in minutes.

---

## Phase 0 done when…
A logged-out user can paint fantasy landmasses with coastal rings on parchment,
scatter/place/edit/delete mountains & forests, add icons/rivers/labels, generate a
world, undo/redo everything, export PNG/JPG/WebP, and have work survive a refresh —
smooth at ~1–2k objects, with no backend.

## Core-editor improvement — WP-14 onward
Work order: **`prompts/phase-0.5-core-editor-improvement.md`** — a standing file, not a
phase, and the home for every editor enhancement after P0. Packages continue this
numbering; nothing here blocks P1–P3.

**Batch 1 — terrain as objects.** Terrain stops being paint-only and becomes selectable,
colourable and movable. Full design, constraints, acceptance criteria and fixtures in
`08-terrain-as-objects.md`; **ADR-25** records why it sits here rather than inside P0 (it
needs WP-13's real UI, and it rewrites interaction invariant I9).

- [ ] **WP-14 · Terrain select & colour** (T1) — point-in-polygon hit-test; click /
  shift-click / marquee-by-containment; selection draws as a **highlighted coastline with no
  handles**; properties strip (biome palette, name, delete); the brush paints the chosen
  biome. Needs none of the open decisions.
- [ ] **WP-15 · Terrain move & rotate** (T2) — rigid path transforms baked into
  `path`/`holes`; rings **freeze and fade during the drag**, one derivation on drop;
  **overlap radio, default "keep apart"** (slide back along the drag path to the last
  position that fit). Requires the I9 rewrite first.
- [ ] **WP-16 · Terrain resize** (T3) — scale, then **re-simplify** at the scene's
  `coastDetail` so a scaled coast keeps the point density of a hand-painted one.
- [ ] **WP-17 · Carve a strait** — the third overlap outcome: bite a channel, then roughen
  the machine-straight cut so it reads as coastline. Own package; needs the
  ≥20%-area-remains guard so a small landmass is never erased.

## Later phases (see the phase prompts)
- [ ] **P1** — self-contained HTML embed export + `.map.json` import/export.
- [ ] **P2** — Zitadel auth, Go+Postgres API, cloud save, "my maps", claim local
  drafts, share page + iframe, SVG/PDF export.
- [ ] **P3** — `@byfauzi/map-viewer` then `@byfauzi/map-editor` npm packages.
