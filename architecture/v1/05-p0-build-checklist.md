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

## Terrain engine _(the load-bearing wall — build stage-by-stage vs `04`)_

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
- [x] **WP-11 · Export** — PNG/JPG/WebP; **resolution clamp + warn**; **JPG flattens**
      onto bg. Draws through `canvas/draw.ts`, the one renderer the stage also uses, so an
      export cannot drift from the screen. Clamped on **both** side (16 384 px) and total
      pixels (64 MP) — the second is what actually stops a blank export. Verified by driven
      input, 14 checks.
- [x] **WP-12 · Local-first persistence** — IndexedDB autosave/restore; maps carry
      `meta.id`; survives refresh; no scene data in localStorage. Raw IDB, no wrapper: one
      store keyed on `meta.id`, an `updatedAt` index so startup restores the newest with one
      reverse cursor, values written by `serialize()` so a restore cannot skip `migrate()`.
      **Throttled, not debounced** — an isolated edit lands in ~20 ms instead of waiting out
      the interval. Verified by driven input, 14 checks.

## Ship

- [x] **WP-13 · UI polish** — Tailwind v4 (`prefix(mbf)`, `@theme inline`), tokens,
      `tailwind-variants`, Radix, Lucide, self-hosted fonts. Toolbar, contextual tool rail,
      layer panel with visibility + lock, map settings, generator panel, export dialog,
      confirm dialog, toasts, light/dark. **All five stand-ins retired**; `grep -rn "ponytail:"
src/` no longer names WP-13, and no native prompt or confirm remains. **The driver is
      built**: 29 checks covering undo, redo, the generate confirm and this package's chrome,
      which closes WP-9's and WP-10's missing interaction evidence too.
      **Deploy is the one part not done** — `npm run build` emits a static `dist/` and the
      README documents the two host requirements, but nothing is hosted yet: it needs a host
      and a domain, which are the owner's to choose.

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

**Batch 1 — terrain as objects — complete (WP-14 … WP-17).** Terrain stops being paint-only
and becomes selectable, colourable and movable. Full design, constraints, acceptance criteria and fixtures in
`08-terrain-as-objects.md`; **ADR-25** records why it sits here rather than inside P0 (it
needs WP-13's real UI, and it rewrites interaction invariant I9). **D1 is now settled — yes**
(ADR-28), so WP-15 is unblocked; D4 and D6 are still open.

- [x] **WP-14 · Terrain select & colour** (T1) — point-in-polygon hit-test; click /
      shift-click / marquee-by-containment; selection draws as a **highlighted coastline with no
      handles**; properties strip (biome palette, name, delete); the brush paints the chosen
      biome (**D6 = yes**). **WP-18 made this smaller** — landmasses join the existing global
      selection rather than getting a parallel terrain-only tool, so `08` §4 T1's "terrain
      gains a tool switch" no longer applies. "No handles" now holds **by construction**:
      `objectBounds` stays undefined for a path object, so `frameOf` and the rbush index skip
      it without being asked. Verified by driven input, 15 checks.
- [x] **WP-15 · Terrain move & rotate** (T2) — rigid path transforms baked into
      `path`/`holes`; rings **freeze and fade during the drag**, one derivation on drop;
      **overlap radio, default "keep apart"** (slide back along the drag path to the last
      position that fit). **This landed the I9 rewrite** — the first code where a path
      object's handles actually move geometry. Overlap resolution was generalised beyond
      `08` §5's formulation to cover **rotation** as well as translation, because C1 does
      not care which gesture broke it. 21 unit fixtures + driven input, 15 checks.
      **Carve** is absent from the radio rather than disabled — it arrives with WP-17.
- [x] **WP-16 · Terrain resize** (T3) — scale, then **re-detail** at the scene's
      `coastDetail` so a scaled coast keeps the point density of a hand-painted one.
      **D4 settled: yes**, `ringGap` stays global — rings derive from the union, so there is
      no per-landmass gap to scale. Building it corrected the design: re-simplifying alone
      only fixes scaling *down*; scaling *up* has nothing to remove and must **resample**
      (Chaikin, then simplify). Also closes the **off-canvas clamp** `08` §4 T2 asked for and
      WP-15 missed — folded into the same drop search, so "fits" means legal whatever made
      it illegal. 23 unit fixtures + driven input, 11 checks.
- [x] **WP-17 · Carve a strait** — the third overlap outcome: bite a channel, then roughen
      the machine-straight cut so it reads as coastline. Own package; needs the
      ≥20%-area-remains guard so a small landmass is never erased. Roughening displaces the
      **new points only** — identified by which vertices the boolean did not copy through
      verbatim, which is exact and O(n) where distance-testing would be O(n·m) and still need
      a tolerance. Tapered to zero at both joins, so the cut blends into the coast the user
      drew. 28 unit fixtures + driven input, 9 checks. **Batch 1 complete.**

**Batch 2 — selection across layers.** The Select tool stops being scoped to the active
layer, the toolbar stops presenting a pointer mode as a peer of the six layers, and path-based
objects gain the same frame sprites have. Design in `09-selection-across-layers.md`, decided
in **ADR-28** and **ADR-29**. Every decision it needed is taken.
**Build order is WP-18 → WP-20 → WP-19**, which is not numeric.

- [x] **WP-18 · Selection, unlinked from the layer** — toolbar splits into mode / create
      groups; Select hit-tests every **visible, unlocked** layer at once and is never disabled;
      lock and visibility scope a selection; mixed selections show common controls only; a layer
      is **live when active or holding a selection**; Erase relabels itself "Sea brush" on
      Terrain. Verified by driven input, 16 checks — cross-layer membership proved from the
      layer panel's own counts rather than asserted. **Measured**: after subtracting 62 ms of
      harness, a drag costs ~6 ms for 756 objects in one layer and ~23 ms for 957 across four.
- [x] **WP-20 · Rivers gain a frame** — a selected river draws the ordinary frame _and_ keeps
      its control points, which outrank the frame's handles as I5's new top rung;
      `transform.ts` stops refusing path objects (`isLand`/`remapLand` became
      `isPath`/`remapPath`, so both path types share one branch) and **scale multiplies
      `width`**. Picking stays path-based: `objectBounds` deliberately did *not* widen, because
      that would put rivers in rbush where the box picks — `landmassBounds` became
      `pathBounds` instead, for marquee containment only. **The river tool's select mode was
      deleted rather than kept alongside** (−142 lines there): reshaping and deleting a river
      now work from any layer, which is what ADR-28 asked for. 21 driven checks, seven
      mutations, and one WP-18 cursor bug found along the way.
- [ ] **WP-19 · Terrain joins the selection** (needs WP-17 **and** WP-20 — **both done, so
      this is the next one to build**) — one frame over
      land and sprites, honest only once WP-16 makes every handle move geometry; WP-14's
      coastline highlight stays, additive; footprint wins the click over land; the marquee is
      asymmetric on purpose; double-click a landmass to take its contents too. **The risk is one
      item**: overlap resolution runs first and its resolved delta goes to the whole drag.

**Batch 3 — the drawn shape decides.** Sprites are picked by their bounding box, and the box
is a poor stand-in for the shape: ink fills 53% of a mountain's, 50% of a tree's, and
**28% of the compass's**. Design in `10-hit-testing-precision.md`, decided in **ADR-30**.
Independent of Batches 1 and 2. Authoring side: `HOW-TO-CHANGE-SPRITE-ART.md`.

- [ ] **WP-21 · Precise picking, honest boxes, a guarded parser** — silhouette as a
  **tie-break** over the rbush candidates (not a filter — an isolated tree must still tolerate
  a near-miss); **labels exempt**; `spriteExtent` walks and flattens the path instead of
  scraping numbers, tightening every box for free; and an unsupported path command **fails a
  test** instead of mis-measuring. **Item 4 ships alone if you want it sooner** — it is the
  safety net for changing sprite art.

## Later phases (see the phase prompts)

- [ ] **P1** — self-contained HTML embed export + `.map.json` import/export.
- [ ] **P2** — Zitadel auth, Go+Postgres API, cloud save, "my maps", claim local
      drafts, share page + iframe, SVG/PDF export.
- [ ] **P3** — `@byfauzi/map-viewer` then `@byfauzi/map-editor` npm packages.
