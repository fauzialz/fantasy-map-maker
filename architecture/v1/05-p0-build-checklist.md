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
- [ ] **WP-3 · Sea/eraser brush** (S8 + S9) — difference + connected-components split;
  **larger piece keeps id/name**; lake = interior hole.
- [ ] **WP-4 · Coastal rings** (Pipeline C / S10–S14) — land-union → water → bands →
  clip. **The strait fixture passes.** Cached rings layer; debounced recompute; toggle.

## Styling & objects
- [ ] **WP-5 · Parchment & base styling** — parchment bg, sea fill, biome fills,
  vignette; both global toggles (`parchment`, `coastalRings`) work.
- [ ] **WP-6 · Mountains & forests** — sprite registry + raster cache; scatter-brush /
  one-by-one / object-eraser; z-order `(manual z, Y, scale)`.
- [ ] **WP-7 · Selection & editing** — click / shift-click / marquee (rbush); transform
  handles; bring-forward/send-back; delete; smooth at 1–2k objects.
- [ ] **WP-8 · Icons, rivers, labels** — icon palette; river spline (tapering, no
  rings); text labels (fantasy font, straight).

## Systems
- [ ] **WP-9 · Undo/redo** — command stack; one stroke / scatter-drag / generate = one
  step; terrain commands store only affected-landmass before/after.
- [ ] **WP-10 · Generator** (10a–10h) — noise fields → mask → Pipeline B → speck filter
  → biomes → mountain/forest Poisson scatter → budget cap → assemble; confirm modal;
  one undoable replace; seed = metadata only.
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

## After P0 (see the phase prompts)
- [ ] **P1** — self-contained HTML embed export + `.map.json` import/export.
- [ ] **P2** — Zitadel auth, Go+Postgres API, cloud save, "my maps", claim local
  drafts, share page + iframe, SVG/PDF export.
- [ ] **P3** — `@byfauzi/map-viewer` then `@byfauzi/map-editor` npm packages.
