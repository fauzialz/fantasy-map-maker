# Phase 0 — Core Editor · Agent Work Order

> **You are an AI coding agent.** Build Phase 0 of `map.byfauzi.com`: a complete,
> deployable, **backend-free** fantasy map editor. Work through the packages in the
> order given (prototype-first: the risky geometry pipeline before polish). Do not
> start a package until the previous one meets its acceptance criteria.

## Required reading (load as context before you start)
- `../01-system-design.md` — the whole system.
- `../02-scene-data-model.md` — the scene JSON contract. **This is law.**
- `../03-architecture-decisions.md` — the "why" behind every constraint below.
- `../04-geometry-pipeline.md` — the deep, fixture-backed spec for WP-2, WP-3, WP-4,
  and the terrain half of WP-10. **Build those packages stage-by-stage against it,
  passing each stage's fixtures before wiring stages together.**

## Definition of done for Phase 0
A user can open the app (no login), paint landmasses that render with fantasy-style
concentric coastal rings on a parchment background, scatter/place/edit/delete
mountains & forests, place icons, draw rivers, add labels, generate a whole world from
noise, undo/redo everything, and export the map as PNG/JPG/WebP. Their work autosaves
locally and survives a refresh. It runs smoothly at ~1–2k objects.

## Hard constraints
- **Stack:** React + Vite + TypeScript; **react-konva** for the canvas; **Zustand**
  for state + a command-stack for undo/redo; a **Web Worker** for heavy geometry.
- **Geometry libs:** `polygon-clipping` (boolean), Clipper or `polygon-offset` (ring
  offsets), `marching-squares`, `simplify-js`, `simplex-noise`, `rbush`.
- **No backend, no auth, no network calls.** Persistence is **IndexedDB** only.
- **The scene JSON must match `02-scene-data-model.md` exactly.** Every load path runs
  through `migrate(scene)`.
- **Coordinates are map-space.** Rings are derived, never stored. View state
  (zoom/pan/selection/tool) is never serialized.
- **Perf budget:** stay smooth at 1–2k objects. Active layer live; other layers cached
  bitmaps **at viewport resolution**. Heavy geometry off the main thread.
- **Styling:** DOM UI uses **Tailwind v4 + `tailwind-variants` + CSS-variable tokens +
  Radix primitives + Lucide**, per `../06-frontend-styling.md`. Prefix `mbf:` from day
  one; tokens defined once and shared with the canvas colors.

## Suggested project structure
```
src/
  app/            App shell, routing (single editor route), layout
  canvas/         Konva stage, layer components, viewport (pan/zoom), transform
  engine/
    terrain/      raster mask, vectorize (marching-squares→smooth→simplify),
                  boolean merge/split, connected-components
    rings/        buffer-union → offset → clip-to-water ring derivation
    generator/    noise fields → mask → scatter → biomes
    worker/       geometry Web Worker + typed message protocol
  scene/          scene types, migrate(), factory helpers, (de)serialize
  state/          Zustand store, command stack, commands/*
  tools/          brush, sea/eraser, scatter, place, river-spline, label, select
  assets/         hand-drawn SVG sprites (mountains, trees, icons), parchment texture
  sprites/        sprite registry + rasterization cache
  export/         PNG/JPG/WebP export with resolution clamp
  persistence/    IndexedDB autosave/load
  ui/             toolbar, layer panel, brush/generator controls, modals, toasts
```

---

## Build order (work packages)

### WP-0 · Project scaffold
- Vite + React + TS. ESLint/Prettier. A single editor route.
- Install the geometry libs above. Set up a **Web Worker** with a typed
  request/response protocol (`{ id, op, payload }` → `{ id, result | error }`).
- Implement `scene/` types **verbatim from `02-scene-data-model.md`**, plus
  `createEmptyScene(preset)`, `migrate(scene)` (v1 = identity, but wire the call site
  everywhere), and serialize/deserialize.
- **Acceptance:** app boots to an empty canvas of the chosen preset; a round-trip
  `serialize→deserialize→migrate` of a hand-written scene is loss-free.

### WP-1 · Canvas, viewport, layer scaffolding *(prototype-first foundation)*
- Konva `Stage` with a root group; **pan** (space-drag or middle-drag) and **zoom**
  (wheel), **clamped** to min/max. Bounded to the canvas extent.
- One `Konva.Layer` per semantic layer in the fixed order (see data model §3).
- Implement the **caching strategy**: the active layer keeps live nodes; inactive
  layers render to a **bitmap cache at viewport resolution**, regenerated on zoom
  change. Prove it with placeholder rectangles first.
- **Acceptance:** smooth pan/zoom; switching the active layer flips which layer is
  live vs cached; no full-map-resolution bitmaps allocated (verify memory).

### WP-2 · Terrain engine: brush → polygon *(the load-bearing wall)*
**Build this against `../04-geometry-pipeline.md` → "Pipeline A" (stages S1–S9),
stage-by-stage, passing each stage's fixtures before composing them.** That doc pins
every algorithm, parameter, coordinate/scaling convention, and fixture; this package is
"implement Pipeline A." Summary of what it delivers:
- **During drag:** stamp the brush into an offscreen raster mask (S1); live preview.
- **On commit (Worker):** contours (S2) → Chaikin (S3) → simplify by `coastDetail` (S4)
  → to-map-space-int (S5) → assemble landmass (S6) → union with overlapping land (S7)
  → split by components (S9).
- **Adjustable brush size** UI.
- **Acceptance:** every S1–S9 fixture passes; end-to-end, painting produces clean
  editable `landmass` objects; overlapping strokes union into one coastline; a detached
  blob becomes a second landmass; the coast-detail slider visibly changes smoothness;
  all heavy work is off the main thread.

### WP-3 · Sea/eraser brush: difference + split
**Implements `../04-geometry-pipeline.md` stages S8 (difference) + S9 (split, with the
larger-piece-keeps-id rule).**
- The **sea/eraser brush** subtracts from land (S8); connected-components (S9) splits a
  cut landmass into two objects, or an interior subtraction creates a **lake (hole)**.
- **Identity rule (S9):** on split/merge the **larger piece keeps id/name**; the smaller
  gets a fresh id + empty name; show an undo-able toast.
- **Acceptance:** the S8/S9 fixtures pass; cutting a landmass yields two independently
  selectable objects; erasing an interior region yields a lake; identity rule holds.

### WP-4 · Coastal rings (derived) *(the signature look)*
**Build this against `../04-geometry-pipeline.md` → "Pipeline C" (stages S10–S14).**
- In the Worker: land union (S10) → water region (S11) → ring bands (S13) → clip to
  water (S14). This yields ocean **and** lake rings from one pass and merges rings
  between close islands into a shared band.
- Render bands into the dedicated cached rings-bitmap layer (between sea and land),
  stroke + opacity falloff per index. Recompute **only on terrain commit**, debounced.
  Toggle via `settings.coastalRings`; `ringCount`/`ringGap` UI controls.
- **Acceptance:** **the S14 "strait" fixture passes** (two close islands share one clean
  band, no pinch), plus the other §4 fixtures; rings radiate from every coast and inward
  around lakes; toggling is instant; editing terrain updates rings without blocking.

### WP-5 · Parchment & base styling
- Parchment background (tiled texture or procedural), toggle via `settings.parchment`;
  sea fill; biome fills for landmasses; optional vignette/grain. Fantasy palette.
- **Acceptance:** the map reads as a fantasy chart; both global toggles
  (`parchment`, `coastalRings`) work.

### WP-6 · Object layers: mountains & forests
- **Sprite registry** + rasterization cache (SVG → image once per variant); several
  hand-drawn variants for mountains and trees.
- Three placement modes reused across object types:
  - **Scatter brush** — sample points along the stroke, instantiate N objects with
    jittered `scale`/`variant`/`rotation`; one **scatter-drag = one undo step**.
  - **One-by-one placement** — one object per click.
  - **Object-eraser brush** — remove objects under a drag (contextual to active tool).
- **z-order** = `(manual z, Y, scale)` per data-model §5.
- **Acceptance:** scatter a mountain range, then select/move/resize/delete individual
  mountains; bigger trees tie-break to the front; erase several with a drag; same
  mechanics work for forests.

### WP-7 · Selection & editing (multi-select)
- Click-select, **shift-click**, and **marquee drag**, backed by **rbush**.
- Transform handles (move/scale/rotate) for single and multi-selection; bring-forward/
  send-back sets `z`; Delete removes selection.
- **Acceptance:** marquee-grab a whole range and move it as one; multi-object
  transforms and deletes are each one undo step; selection stays fast at 1–2k objects.

### WP-8 · Icons/landmarks, rivers, labels
- **Icons:** one-by-one placement from an icon palette (`kind`), select/edit/delete.
- **Rivers:** a **spline tool** — click to lay points, render a **tapering polyline**
  (wider toward the sea), **no rings**, above land; editable control points.
- **Labels:** click to place text; fantasy font; edit text/size; straight for v1
  (`pathId` reserved).
- **Acceptance:** all three place, render on their correct layers in the right order,
  and are editable/deletable.

### WP-9 · Undo/redo (command stack)
- Implement the command stack from §13, covering paint land, erase sea, place, scatter,
  transform, edit props, delete, generate and toggle setting. Terrain steps store
  before/after polygons of only the affected landmass(es).
  *(As built: one diff mechanism rather than a class per name — see §13 and ADR-27. Those
  names describe what a step carries, not nine implementations.)*
- **Acceptance:** every action is exactly one undo step; redo restores precisely;
  terrain undo doesn't snapshot the whole scene.

### WP-10 · Noise generator
Follow §10 and ADR-21. The **terrain half reuses `../04-geometry-pipeline.md`
"Pipeline B"** (noise mask → S2–S9). Only the generator-specific stages below are new;
build them stage-by-stage with their own fixtures.

- **10a · Noise fields.** `simplex-noise` seeded from `scene.generator.seed`: an
  **elevation** field (fractal/octave sum) and a **moisture** field, plus a
  **latitude/temperature** gradient. `roughness` → octave count/persistence; expose the
  raw fields for downstream stages. *Fixture: same seed → identical fields
  (determinism); different seed → different.*
- **10b · Land mask + terrain.** Threshold elevation at `seaLevel` (from `landAmount`)
  → binary mask → **Pipeline B (S2–S9)** → landmass objects. Apply **`worldType`**
  (single continent / archipelago / multiple) as a low-frequency mask bias.
  *Fixture: higher `landAmount` → more land area.*
- **10c · Speck-island filter.** Drop landmasses with area < `minIslandArea`.
  *Fixture: sub-threshold specks removed; large islands kept.*
- **10d · Biome assignment.** Per landmass region, assign
  `grassland | forest | desert | snow | swamp` from elevation × moisture × latitude
  (e.g. cold+any→snow, hot+dry→desert, wet+mid→swamp/forest, else grassland).
  *Fixture: a hot-dry region → desert; a cold region → snow.*
- **10e · Mountain scatter.** Place `mountain` objects on **ridges** (high elevation /
  local maxima or high slope), density from `mountainDensity`, spaced by **Poisson-disk
  sampling**, jittered `scale`/`variant`/`rotation`. *Fixture: mountains fall on
  high-elevation cells only; spacing ≥ Poisson radius.*
- **10f · Forest scatter.** Place `tree` objects where **moisture high + elevation mid**,
  density from `forestDensity`, Poisson-spaced. *Fixture: trees avoid sea, peaks, and
  desert.*
- **10g · Budget cap.** After scatter, if total objects would exceed the perf budget
  (~1–2k), **thin uniformly** to fit. *Fixture: a dense config lands ≤ budget.*
- **10h · Assemble + apply.** Emit a fresh scene; derive rings (Pipeline C); store
  seed/params in `scene.generator` (**metadata only** — never re-run at load);
  **confirm modal** when the canvas is non-empty; apply the whole replace as **one
  undoable command**.

- **Controls:** Land amount, Roughness, Seed/re-roll; **Advanced drawer** (sea level,
  mountain density, forest density, world type).
- **Acceptance:** each 10a–10h fixture passes; Generate yields a believable, populated,
  multi-biome world within budget; re-roll varies it; generating over work prompts
  confirmation; a single undo restores the previous map exactly; every generated object
  is hand-editable.

### WP-11 · Export (PNG/JPG/WebP) with resolution clamp
- Export the scene at a user-chosen scale (1×/2×/…) via an offscreen stage.
- **Clamp** so neither dimension exceeds ~16k px (browser limit) and warn if capped.
  **JPG must flatten onto a background color** (no alpha). WebP offered as "web".
- **Acceptance:** exports are correct at each scale; an over-large request is capped
  with a clear warning (never a blank image); JPG has no black background.

### WP-12 · Local-first persistence (IndexedDB)
- Autosave the current scene to **IndexedDB** continuously (debounced); reload on
  startup. Maps carry their **client UUID** (`meta.id`) for the future P2 claim flow.
- A minimal local "my maps" list (create/open/delete) is nice but optional for P0.
- **Acceptance:** work survives a refresh; no data loss; no localStorage used for
  scene data.

### WP-13 · UI polish & deploy
- Build the chrome per `../06-frontend-styling.md`: Tailwind v4 (`prefix(mbf)`,
  `@theme inline` tokens, `@custom-variant dark` on `[data-theme]`), component styles in
  `tailwind-variants`, Radix primitives (Dialog/Slider/Switch/DropdownMenu/Tooltip/
  Popover), Lucide chrome icons, self-hosted fonts.
- Toolbar (tools + brush size), layer panel (visibility/lock/reorder-within-rules),
  settings toggles, generator panel, export dialog, confirm modal, toasts.
- Deploy the static SPA (any static host/CDN).
- **Acceptance:** a first-time visitor can make and export a good-looking fantasy map
  in a couple of minutes without instructions; light/dark both work via the tokens.

---

## Gotchas to respect (do not rediscover the hard way)
- **Memory:** never cache layers at full-map resolution — viewport resolution only.
- **Strait collision:** rings must come from the **land union**, clipped to water.
- **Clipper precision:** boolean/offset libs want scaled integer coords — pick a scale
  factor and be consistent.
- **Export blanking:** always clamp export dimensions to browser limits.
- **JPG alpha:** always flatten JPG onto a background.
- **Determinism:** the generator's output is stored geometry; the seed is metadata,
  never re-run at load.
- **Undo granularity:** one stroke / one scatter-drag / one generate = one step.

## Out of scope for Phase 0
Login, any backend/network, cloud save, share links, iframe, SVG/PDF export, the React
library, the second (modern) style. (Those are P1–P3.)

**Also out of scope, and deliberately not P1–P3:** further work on the core editor itself.
WP-13 is the last package in *this* file; WP-14 onward live in
`phase-0.5-core-editor-improvement.md`, which is the standing home for editor enhancements
after P0 ships. Do not add packages here — this file's scope and definition of done are
frozen. The first batch waiting there is terrain-as-objects (WP-14…WP-17, designed in
`../08-terrain-as-objects.md`, decided in ADR-25).
