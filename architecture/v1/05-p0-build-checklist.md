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
      object diffs; sliders coalesce; emptying the canvas is undoable as a whole-scene step (the
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

**Batch 2 — selection across layers — complete (WP-18, WP-20, WP-19).** The Select tool stops
being scoped to the active layer, the toolbar stops presenting a pointer mode as a peer of the
six layers, and path-based objects gain the same frame sprites have. Design in
`09-selection-across-layers.md`, decided in **ADR-28** and **ADR-29**.
**Build order was WP-18 → WP-20 → WP-19**, which is not numeric.

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
- [x] **WP-19 · Terrain joins the selection** — one frame over land and sprites; WP-14's
      coastline highlight stays, additive; footprint wins the click over land; the marquee is
      asymmetric on purpose; double-click a landmass to take its contents too. **Seven of its
      eight items were already true when it started** — WP-15, WP-16, WP-18 and WP-20 each
      landed one on the way past, including the shared resolved delta this package was sized
      around. What was actually left: the **double-click** (`standingOn` in `scene/bounds.ts`,
      membership by **anchor**, so a sprite overhanging the water still belongs to the land it
      stands on), a rail hint gone stale claiming land could only be recoloured, and a
      double-click handler keyed on the *rivers layer* rather than on a river being drawn —
      which had been swallowing the gesture there since WP-20 made that tool drawing-only.
      **The evidence is what this package really bought**: 14 driven checks and six mutations,
      one per decision. The riskiest item was **not caught on the first pass** — a stray riding
      the requested delta was still standing on the same continent, because the slip was 360
      units against a 1 060-unit landmass. `07` §1's rule one layer up: overshoot until the
      slip exceeds the thing you are measuring. **Batch 2 complete.**

**Batch 3 — the drawn shape decides.** Sprites are picked by their bounding box, and the box
is a poor stand-in for the shape: ink fills 53% of a mountain's, 50% of a tree's, and
**28% of the compass's**. Design in `10-hit-testing-precision.md`, decided in **ADR-30**.
Independent of Batches 1 and 2. Authoring side: `HOW-TO-CHANGE-SPRITE-ART.md`.

- [x] **WP-21 · Precise picking, honest boxes, a guarded parser** — silhouette as a
  **tie-break** over the rbush candidates (not a filter — an isolated tree still tolerates a
  near-miss); **labels exempt**; `spriteExtent` walks and flattens the path instead of scraping
  numbers; an unsupported command **throws**, and a test walks every path in the registry.
  **No `Path2D`** — one parser (`sprites/path.ts`) feeds both the extent and the silhouette,
  and picking ray-casts the flattened rings through the existing `pointInRing`, so all of it
  stays canvas-free and unit-tested in Node as `10` P4 requires. **Re-measured (`10` §2):**
  mountain 2 **51% → 71% ink** as its box shrank **27%**, trees 1 and 3 **17%** and **15%**
  tighter; every other box was already on-curve and did not move, which is the honest result —
  flattening only pays where a control point was defining an extreme. 31 unit fixtures, 7
  mutations, and 15 driven checks. **The discriminating check was proved by mutation**: with
  the tie-break removed the click deletes the compass instead of the tree, and making
  precision a *filter* fails both the near-miss check and the cursor check — I4 tracking the
  change on its own, because hover and press go through the same `objectAt`.

**Batch 4 — more than one map.** `drafts.ts` already keys drafts by `meta.id`, but only
`saveScene` and `loadLatestScene` exist, so the editor has one working copy and a second map
is unreachable. Became load-bearing when cloud sync went opt-in per map. Decided in
**ADR-33**; no design doc yet.

- [x] **WP-22 · The local map gallery** — `listDrafts()` over the existing `updatedAt` index
  plus a Radix dialog: **new map · open · rename · delete**, newest first, with a thumbnail
  rendered on gallery open. **Local only**, as specified.
  **It found a live defect rather than only adding a feature**: `createEmptyScene` mints a
  fresh `meta.id`, so the old single "New canvas" button had been writing a *new* record and
  stranding the previous map on every click since WP-12. The gallery surfaces drafts that were
  already there. Split into **New map** (fresh id, not undoable) and **Reset canvas** (same id,
  confirm + undo) — **ADR-35**, which also records why rename is deliberately not undoable
  (`diffScene` never walks `meta`, so `record` would file an empty step).
  **The boot path changed**: `loadLatestScene` alone is wrong once there are several maps, so
  the open map's id is remembered in localStorage — an id, not scene data, so WP-12's rule
  holds — with the newest-draft fallback covering a draft deleted since.
  **Measured, and it settled a schema question**: listing 20 drafts of a 152 KB scene costs
  **7.4 ms** against 1.0 ms if summaries lived in their own store. A 7× ratio and an irrelevant
  absolute, so **no `DB_VERSION` bump** — the ceiling is a `ponytail:` comment, to be revisited
  only if ADR-33's ~20-draft cap ever rises.
  **Thumbnail size, measured** (4000×3000 landscape, headless Chrome at dpr 1, rendered through
  the gallery's own path and cross-checked against the Blob it actually stored):

  | | empty map | generated world |
  |---|---|---|
  | **240 px — shipped** | **1.5 KB** | **15.7 KB** |
  | 480 px | 4.3 KB | 49.4 KB |

  So **~16 KB** for a full map, and at ADR-33's ~20-draft cap that is ~320 KB of thumbnails in
  total — about **10%** on top of the scene JSON, and nothing against the IDB quota.
  **WebP is load-bearing, not a default.** Same image, 240 px, generated world: webp 15.7 KB ·
  jpg 18.4 KB · **png 79.4 KB**. On an *empty* map PNG is 65.6 KB against webp's 1.5 — **44×**
  — because the parchment is procedural noise, so lossless compression pays full price for
  pixels carrying no information. Changing the format is one argument to `toBlob` in
  `MapGallery.tsx`; these are the numbers that say don't.
  6 unit fixtures + **22 driven checks and 5 mutations**. Two checks did not discriminate on
  the first attempt and both were fixed: "a reload restores the open map" could not fail
  because *opening* a map re-saves it, making it the newest write too — the check now ages
  another record so the two answers genuinely differ; and the thumbnail check passed because
  the gallery re-renders on open, masking a wipe, so it now reads the **record** rather than
  the UI (WP-11's rule).

**Batch 5 — the editor shell.** The right rail stacks five unrelated concerns in one scrolling
column, `MapPanel.tsx` is 300 lines, and **Generate** exists twice — in the toolbar and in the
rail. Commands move to a menu bar; the rail keeps only what you steer while watching the map.
Design in `11-editor-shell.md`; decided in **ADR-36**, **amended by ADR-40**.

**Split into two packages, with Batch 8 between them.** ADR-40 gives the app routes, which changes
what the menu bar contains — so building all of `11` first would mean building two menu items and
deleting them a package later. **WP-23** (`11` §5) goes first because WP-30's `/maps/create` page
mounts the same generate form; **WP-32** (`11` §3–§4) lands after Batch 8. Build order for the two
batches is therefore **WP-23 → WP-30 → WP-31 → WP-32**.

- [x] **WP-23 · The generate dialog and the world code** (`11` §5) — ADR-21's generate confirm
  **folds into the generate dialog** (warning line plus a primary button reading "Replace map" on a
  non-empty scene, "Generate world" on an empty one), so a modal on top of a modal goes away.
  **The switch gets visible contrast**: `switchRoot` fills its off state with `bg-sink`, a hair from
  `--panel` in both themes, so an off toggle is invisible and the sea-level slider below it looks
  permanently dead for no visible reason. The gate stays — the slider really does nothing until the
  override is on — and the **switch** is fixed to ≥ 3:1 against the panel, which repairs every
  toggle in the app at once. And **the seed becomes a world code**: a human-readable `w1-` string
  carrying all seven world inputs, because the seed is four of the nine `generateWorld` reads and
  three of the rest are session-only, so a bare copyable seed would fail *silently*. Canvas size
  and `coastDetail` are deliberately **out** of the code — which is what lets WP-30's create page
  pick the canvas first and then accept a code for everything else.
  **Build the form as one component with two containers**, since WP-30 mounts it on a page where
  the scene is always empty. §5.1's branch is already exactly that difference.
  Acceptance: a `worldCode` round-trip plus rejection of a garbage string and a `w2-` string; an
  **off** switch measured at **≥ 3:1** against the panel in both themes, not eyeballed; the
  sea-level slider still enabling only when its toggle is on.
  **Measured, and the number is worse than the design assumed.** `--muted` gives the off track
  **5.28:1** light and **6.26:1** dark against `--panel`; the thumb clears both track states —
  5.28 / 6.26 off, **6.38 / 6.58** on. But `bg-sink` measured **1.16:1 and 1.06:1**, which is not
  low contrast, it is *no* contrast: 1.06 is at the threshold of what an eye can separate at all.
  §5.2 read as a polish item and was a control nobody could see. Taken two ways that agree — the
  computed style, and the **pixel actually painted** (a 1×1 `Page.captureScreenshot` clip), so an
  overdrawn or translucent fill could not hide behind a resolved token.
  **The border forced a second change**: with `border` on the track the thumb sat off-centre in
  the remaining 16 px, so `switchRoot` gained `flex items-center` — a block child was riding the
  top of the box and had only looked right while the box had no border.
  **The generator left the rail entirely** (−95 lines there), so `Generate` exists once rather
  than twice; WP-32 takes the rest of `MapPanel`. `GenerateForm` and `GenerateDialog` are separate
  exports, which is the seam WP-30 mounts.
  **The code applies as you type, the moment it parses** — not behind an Apply button. A paste
  lands on the controls with nothing else to press, a half-typed code simply has not parsed yet,
  and the complaint waits for blur or Enter. A rejected code snaps the field back to the live one,
  so "changes nothing" is *visible* rather than promised.
  **Layout finding: the code has to sit outside the scrolling parameters.** With the whole form in
  one scroll box, the hint carrying §5.3's "canvas size is not in the code" promise scrolled out
  of view exactly when the Advanced drawer was open — the one case where the promise is worth
  reading. Only the parameters scroll now, and nothing scrolls at all at 900 px.
  **40 driven checks, three of them built to discriminate**: the old `bg-sink` fill fails the same
  measurement · a rejection check counts toasts as well as matching text, because they stack for
  8 s and the previous one satisfies a text match on its own · one field changed in the code gives
  a different world. **And one probe was wrong in a way worth recording**: the scene fingerprint
  first hashed the terrain objects whole, which can never match — `applyGenerated` mints a fresh
  uuid per object, so two runs of the same world differ in every id. A comparison that can never
  pass is as useless as one that can never fail, and it looks like a real defect while it lasts.
  Hash the geometry, not the identity.
- [ ] **WP-32 · The menu bar, and a rail that holds one idea** (`11` §3–§4) — Map · Edit · View ·
  Help, in their own row above today's tool row; the right rail drops to **Layers + Appearance**;
  the bottom autosave strip is absorbed into the menu bar so two rows cost no height. New
  `ui/MenuBar.tsx` on Radix `DropdownMenu` (already installed — keyboard nav, Escape, typeahead
  and roles come from the primitive). `Canvas size ▸` becomes a **radio submenu**, which makes
  "re-picking your current size is a no-op" structural rather than a guard; the map title becomes
  an inline input, so `Rename` is a control removed. `deleteSelection` / `restackSelection` lift
  into the store — they already called `getState()` internally.
  **The `Map` menu holds four items, not six** (ADR-40): `Canvas size ▸`, `Reset canvas…`,
  `Generate world…`, `Export image…`. **`New map` and `Open Map…` are WP-30's**, on the gallery
  page — the menu owns *this* map, the gallery owns *which*. The **brand mark `[M]` links to
  `/maps`** and is the way back. `data-action="new-map"` and `"gallery"` keep their values on their
  new homes; every other `data-*` hook keeps its value here, since the CDP recipes in
  `07-interaction-invariants.md` drive them.
  Acceptance is driven input per menu item and no rail scrollbar at 900 px.

**Batch 6 — tools that say what they do.** Four places where a tool's behaviour and the UI's
description of it have drifted apart. Design in `12-tools-that-say-what-they-do.md`; **ADR-37**
covers WP-26 only. Build order is numeric, and WP-25 precedes WP-26 because both edit
`LAYER_TOOLS` and the smaller change should land first.

- [x] **WP-24 · The brush ring follows the cursor** — a ring at the hover point for every
  brush-shaped tool (terrain, sea, scatter, erase) and none for place or select. Today nothing
  shows until a drag is under way, so the only way to learn what `brush size 240` means at this
  zoom is to make an edit and undo it. **Reuses the hover point `MapStage` already tracks** for
  the x/y readout — this adds a circle, not a mechanism. Map-space radius, screen-constant
  stroke (I8). Acceptance: driven pointer movement **without pressing**.
  **A locked layer was added to the "no ring" list.** The design named place and select; lock is
  the same rule for the same reason — I4 says the pointer promises what a press will do, the
  cursor already reads `not-allowed` there, and a ring would be the one thing on screen still
  claiming the press will paint. Panning and the space-drag are out for the same reason.
  **The weights are set against the art, not picked from a scale.** At the first pass (3 px halo,
  1.25 px core) the ring was *thinner than the outlines the sprites are drawn with*: over a dense
  mountain field the paint ring read as one more contour line and the dashed eraser ring
  disappeared outright — reinstating the very defect the package removes. 5 px and 2 px. The
  tones stay the palette's brightest and darkest (`peakLit` over `ink`), so the ring never has to
  know what is under it and both follow the theme.
  **17 driven checks, and the pixels are the evidence** — the ring is a Konva shape with no DOM
  node, so every assertion reads `getImageData` on the tool-chrome canvas, which holds nothing
  else at rest. The diameter is checked *absolutely* (60.0 px drawn against 260 map units ×
  0.23 scale), not just "it changed".
  **Three mutations, and the second one is the lesson.** Radius `brushSize` instead of
  `brushSize / 2` fails two checks; deleting the dash fails the removal check at 100% ink against
  58%. But **deleting `/ scale` from the stroke — the I8 violation — passed a full green run**:
  the driver compared fit zoom against 50%, where a 3-unit map-space stroke draws 1.5 px and a
  screen-space one draws 3 px, and antialiasing spans that gap. `07` §1's overshoot rule, hit for
  the third time in this repo. At **400%** the same mutation draws a 12 px band and fails
  decisively — so the driver now **asserts the zoom it reached** before trusting the comparison,
  because a measurement taken where two implementations agree is true of both and means nothing.
  **Rides along: every slider in the app was unnamed to a screen reader.** `aria-label` sat on
  Radix's `Slider.Root`, which is a plain span with no role, while the `role="slider"` thumb that
  carries `aria-valuenow` had no accessible name at all. Found because the driver read
  `aria-valuenow` off the root and got nothing. One line in `ui/controls.tsx` — the label now goes
  on the thumb, and the root keeps its inert copy because it is the handle every driver so far
  selects on.
- [x] **WP-25 · One Select, everywhere** — ADR-28 made Select global and the per-layer copies
  were never removed, so `LAYER_TOOLS` still lists `"select"` on all five object layers and the
  rail renders a second chip (a third name on rivers, `Edit`). Drop `"select"` and **nothing
  else** — `"erase"` stays until WP-26, because the rail's chip is currently the only object
  eraser there is. Smaller than it looks — `setActiveLayer` already treats select as outside the
  table.
  **Rides along: the selected coastline gets honest contrast.** `BIOME_FILL` is refreshed from
  CSS tokens per theme while the outline is a hardcoded `#22685B`, so the background moves and
  the outline does not. Fix is a two-tone halo-plus-core stroke rather than a better single
  colour, so no colour has to work on grassland *and* snow *and* dark-mode desert.
  **Measured, and the design named the wrong background.** The complaint was contrast against the
  biome fills — but `#22685B` clears **3.4:1 to 5.8:1** against grassland, snow, desert and forest
  in *both* themes, so the fills were never the problem. The highlight traces the **coastline**,
  so it lands on `--map-coast`, and dark teal on dark brown measures **1.83:1 light / 2.20:1
  dark**. The halo is what pays for that (10.4:1 / 9.3:1) while the core is what still reads over
  a pale fill, where the halo itself is 1.02:1 against snow. Between the two, one always wins —
  which is the design's actual claim, now with the numbers attached to the right surface.
  **The rail table is exact, not just Select-free**: rivers offers `Draw` alone, labels `Place
  one`, icons and the scatter layers keep Erase for WP-26.
  **30 driven checks and two mutations.** Putting `"select"` back fails the chip check; deleting
  the halo fails the width check at 3–4 px against 7. **The second mutation improved a check**:
  "the accent is in the middle and the halo at the edge" *passed* with the halo deleted, because
  a lone accent stroke also has its purest colour at the centre — it asserted the core and
  nothing about the halo. It now asserts the edge is nearer the halo tone than the accent, and
  fails as it should.
  **And the river check had to aim at the stored point, not the clicked one.** `riverCentreline`
  is `chaikin(points, 2, false)`, which pins only the ends, so an interior control point sits
  well off the ribbon it produced — pressing at the coordinate that created it hits open water at
  a river's ~6 screen px width. Select by an endpoint, reshape by the middle: the real order
  anyway, since control points are only drawn once the river is chosen. The point then moves
  **603 map units against an expected 609**.
- [x] **WP-26 · Erase is its own tool; the sea brush is terrain geometry** (**ADR-37**) — the
  contextual eraser splits. Sea brush unchanged; **Erase becomes a global object eraser**, peer
  of Select, removing every object the disc overlaps on every visible, unlocked layer, and **a
  landmass it touches dies whole** (partial removal *is* the sea brush). Fixes a real gap:
  `isUnderBrush` refuses anything without a footprint, so landmasses and rivers have never been
  erasable by any tool. Reuses `landmassAt` and `river.ts`'s `distanceToSegment`. **`LAYER_TOOLS`
  loses `"erase"` here**, finishing what WP-25 started — once the tool is global the rail chip is
  the same duplication Select's was.
  **`12` D1–D3 settled**: rivers die too, whole · Erase sits beside Select in the mode group · and
  *hidden* protects **every** layer, not only terrain — ADR-28's rule with no exception, so a
  stroke can sweep the map and take only what you left showing. Acceptance needs a driven drag across a landmass, a
  locked layer that survives it, and **a mutation proving the lock check discriminates**.
  **The split needed a third button, which the design did not say.** "Sea brush stays where it is
  and keeps its name" was written when it *was* the Erase button on terrain; once Erase stopped
  being contextual, one button could not be both. Sea brush is now its own `data-tool="sea"` in
  the mode group, rendered only on terrain — where there is geometry to edit — and Erase is
  always present and never disabled.
  **`GLOBAL_TOOLS` is the generalisation this package earned.** `setActiveLayer` and the toolbar's
  `leaveSelect` both special-cased `"select"` by name; erase is the second member, so the rule is
  now a list rather than a comparison, and `leaveSelect` became `leaveGlobalMode`. The active
  layer's **lock no longer gates the eraser** either — `eraseAt` skips locked and hidden layers
  itself, which is exactly the arrangement selection already used.
  **Two follow-ons the design did not name, both found by building it.** The rail's brush-size
  slider was gated on *object* layers, so it vanished on **rivers** — the one layer that is not an
  object layer and where the eraser now works, leaving its only control unreachable. And WP-24's
  brush ring had to follow the tool: the erase ring shows on terrain and rivers now, and a locked
  active layer no longer suppresses it, since the lock stopped meaning anything to this tool.
  **A green unit test was encoding the defect.** `objectHit.test.ts` asserted *"ignores path-based
  objects, which have no footprint"* — the exact behaviour ADR-37 reverses. "No footprint" is
  still true and is why the branches are needed; it just stopped meaning "not erasable". Replaced
  with four fixtures: on the land, reaching from offshore and failing to, a **lake shore counting
  as coastline** (even-odd puts the lake outside the land, so only the reach finds it), and a
  river taken whole.
  **17 driven checks, 8 unit fixtures, 2 mutations.** Dropping the `visible || locked` guard fails
  **both** the locked and the hidden checks — D3 proved, not asserted. Dropping the landmass
  branch fails 3 unit fixtures and 3 driven checks. The sea brush is checked in the same run
  precisely because this is the package where it would break: a stroke through the middle still
  cuts one landmass into two.
- [x] **WP-27 · Scatter rotation is a knob, not a constant** — `anchorAt` hardcodes
  `jitter(5)`; replace it with session state, surfaced as a slider, **defaulting to 0** so every
  sprite is upright until asked otherwise. The value is jitter *spread*, not an angle.
  **`12` D4 settled — the generator gets its own field, shared with nothing.** Not the rail's knob
  and not a hidden constant: an explicit slider in the generate dialog's Advanced drawer, and an
  eighth value in the world code. The reasoning is what a world code is *for* — it exists because a
  bare seed silently under-specifies a world, so a generator reading a live rail slider would mean
  the same code rebuilt a different world depending on a knob moved an hour ago. The two questions
  genuinely differ: the rail's is about the map you are drawing, this one is part of a recipe.
  **So the code is `w2-` now**, and a `w1-` string is rejected by the same loud path as a garbage
  one. A changed field count is exactly what the version tag was for; nothing had shipped, so no
  migration is owed. The generator keeps **5°** as its default, so generated worlds look unchanged,
  while the brush defaults to 0.
  **`scatter.ts`'s comment had to be rewritten either way** — it claimed the "same jittered look the
  scatter brush gives by hand", which stopped being true the moment the brush got a default of its
  own. That was true under *both* answers to D4, which is why the doc called it out.
  **15 driven checks reading the record, plus 17 world-code fixtures.** The decisive one is the
  decoupling: with the rail slider at **20**, a world generated from a code ending `-0` comes back
  with **max |rotation| 0 across 222 mountains and 793 trees** — the rail cannot leak in. Then the
  same world at `-40` exceeds anything ±20 could produce.
  **Two mutations, one per half of D4.** Restoring `jitter(5)` to `anchorAt` fails the upright
  check. Pointing the generator at `scatterRotation` — the option D4 rejected — fails the
  decoupling check at 19.98° where 0 was required, and caps the ±40 world at 20.
  **And a driver bug worth recording**: the generate dialog remounts on every open, so its
  `Collapsible` resets closed. Two checks were reading a rotation slider that was not in the DOM
  and comparing `NaN` to `NaN`, which passes. Opening Advanced is now part of opening the dialog,
  and the "changes nothing" check asserts its baseline is a real number first. **Batch 6
  complete.**

**Batch 7 — reading the map.** Three complaints about the finished picture rather than the tools
that make it. Design in `13-reading-the-map.md`; **ADR-38** and **ADR-39**.

- [ ] **WP-28 · The map at a glance** — two constants, judged by looking. **Mountains at
  three-quarters**: `SPRITE_HEIGHT.mountain` 190 → 142, against 84 for a tree and 165 for a
  landmark. **Settle `13` D5 first** — the constant is the base height for the *kind*, so changing it
  is silently retroactive across every saved map; the alternative is scaling at placement and
  leaving one map holding two mountain sizes. Recommended: change the constant, since "mountains
  are too big" is about the art, and nothing is deployed. Costs nothing downstream — WP-21's ink
  percentages are ratios and stay valid, and `spriteBounds` reads the same constant so boxes and
  picking follow.
  **Zoom out past the canvas edge** (**ADR-38**): `fitScale` stops being the minimum zoom, and
  the floor becomes `fitScale × 0.5`, so the canvas can be seen as an object with edges.
  `clampPan` already centres a map smaller than the view, and `padRect` already clips cache rects
  to the map, so ADR-19's memory budget is untouched. Still bounded — a wider bound, not none.
- [ ] **WP-29 · Rivers meet the sea, and each other** (**ADR-39**) — an endpoint within a
  **screen-space** threshold of a coastline **or another river** snaps to it. Landing that click
  by hand is impossible at fit zoom, and rivers draw above terrain, so a stub of land or a blunt
  cap in open water is visible either way.
  **The mouth is reshaped, not just moved, and the reshape is free.** Moving the point still
  leaves a cap cut across the flow. But `riverCentreline` is `chaikin(points, 2, false)`, which
  **pins the last points the user placed**, and the cap's direction is the tangent of the last
  two centreline points — so writing the final points **along the coast normal** rotates the cap
  onto the coast tangent, and the mouth opens along the shore. **Control points only**: no stored
  outline, no polygon boolean, **no `schemaVersion` bump**, and the baked tail stays draggable.
  Ceiling to record as a `ponytail:` comment — a straight cap matches the coast *tangent*, not
  its *arc*; the curve costs either persisted geometry or a live terrain dependency.
  **The river-to-river half is nearly free**, because WP-8 already decided it: rivers are "flat,
  opaque and unstroked, so two overlapping ribbons paint the same colour twice and a confluence
  is seamless" (`draw.ts`). A tributary needs **no reshaping** — only an endpoint that lands
  *inside* the trunk, overshooting past its centreline by half the trunk's local width so the cap
  is buried. It is not a join: nothing references anything, and deleting the trunk leaves the
  tributary ending in open water.
  Reuses `distanceToSegment` (which WP-26 exports anyway) and `distanceToRiver`. The overshoot is
  a **named constant, not a derivation** — it must sit right against a screen-constant stroke and
  a ring gap the user sets between 4 and 60.
  **`13` D6–D10 settled**: the end *being laid* snaps, whichever it is · **an end that snaps to
  nothing gets a round cap** instead of today's flat cut, so a river stopping mid-map fades out
  rather than being sliced — `riverRibbon` already closes between the last two bank points, so it
  is an arc across that gap · a *dragged* endpoint re-snaps (modifier suppresses it) while a
  *moved coastline* re-snaps nothing, which is consistent because the trigger is always the
  user's hand on that river · nearest wins between a coast and a river · no self-snap. Acceptance
  is driven pointer input reading the **stored points**, plus the preview differing *before* the
  click (I4).

**Batch 8 — routes, a front door, and a page to start from.** The editor has no routes at all:
`App.tsx` is the whole app, one URL is the whole address space, a map cannot be linked or
bookmarked, and the only way to reach a second map is a dialog over the editor. Design in
`14-routing-and-landing.md`; decided in **ADR-40**, which records D1–D12 (all settled).
**Prerequisite:** WP-22, and **WP-23** for the generate form the create page reuses.
**None of this needs a host** — the deploy is WP-13's separate unfinished half.

- [ ] **WP-30 · The routes** — `/maps` (the gallery as a page, titled **Your maps**),
  `/maps/create` (a setup page), `/maps/edit/{uuid}` (the editor), plus two kinds of not-found.
  **Hand-rolled router, ~30 lines**, no new dependency — revisit at P2's nested or guarded routes,
  or on a measurement. It also owns the three things the primitive does not give you: per-route
  `document.title`, scroll restoration on Back to `/maps`, and focus management.
  **The gallery dialog is replaced, not duplicated** — ADR-35 already makes switching maps clear
  the undo stack, so it is a navigation in everything but presentation. `/maps` gains an **empty
  state** it never needed as a modal, and when the list is empty *and known* it `replaceState`s to
  `/maps/create`.
  **`/maps/create` is a page, not a redirect**, because `resetCanvas(preset)` doubles as *change
  canvas size* and discards every object — so canvas size is free exactly once, at creation, and
  there was no screen there to offer it. Defaults to **landscape**; generation runs **in the
  editor after the navigation**, reusing the existing toast. Nothing is written to IndexedDB until
  the user clicks through, so a landing-page bounce leaves no empty draft. Completing the page
  **replaces** its history entry; abandoning it leaves the entry alone, so Back means the right
  thing in both directions.
  **`rememberOpen` / `rememberedOpen` and the `loadLatestScene()` fallback are deleted** — the
  route parameter is already the IDB keyPath, so this removes a mechanism. The editor route does
  **nothing** when `store.scene.meta.id` already matches, which is what makes Back preserve the
  undo stack (the store is a module singleton).
  **Four traps, each a one-line mistake with a delayed symptom** (`14` §4.7): the create page must
  **`replaceState` on completion** (`pushState` puts a finished setup step behind Back, and
  completing it again mints a second map) · `pushState` on the empty-`/maps` redirect traps Back in
  a loop · `location.assign` anywhere is a full reload · and **client-side navigation must flush
  autosave**, because `pagehide` does not fire on a route change and the throttle is 800 ms.
  **Two tabs on one map** get a `BroadcastChannel` warning — the local save path has never had a
  version check, and linkable URLs make the collision easy.
  **Dev and production hold the same routing rule twice** — a Vite `configureServer` middleware and
  the Caddyfile — and must agree; every CDP driver runs against the dev server, so this is not
  polish. Acceptance is driven throughout, including **a mutation proving the flush discriminates**.
- [ ] **WP-31 · The landing page** — a static HTML file at `/`, styled with the Tailwind build and
  `tokens.css` the app already uses, so the page cannot drift from the application and a visitor
  arrives at `/maps` with the stylesheet cached. **No React, no router, no editor bundle.** Hero is
  a **WebP exported from the editor itself**, one primary CTA → `/maps`, six sections each with one
  sentence and one exported image, and only shipped exports advertised. `/how-it-works` is
  **reserved, shell only** — content when the rest is done. **No `/login` or `/signup` pages**:
  ADR-06's PKCE redirects to Zitadel's hosted login, so P2 needs a Sign in *button*, a signup hint
  parameter (verified against a live Zitadel, not assumed) and `/auth/callback`. A static page
  cannot know it is signed in — `platform/README.md` D2 keeps no refresh token in the browser — so
  the header reads a **localStorage hint**, which is a label and never an authorization decision.
  Ship the sign-in slot now, the buttons at P2. Acceptance: the headline and every section heading
  are **in the HTML body** before any JavaScript, and the page loads **no editor bundle** —
  asserted on the response and the network, not on feel.

## Later phases (see the phase prompts)

- [ ] **P1** — self-contained HTML embed export + `.map.json` import/export.
- [ ] **P2** — Zitadel auth, Go+Postgres API, **opt-in per-map cloud sync** with the cap
      enforced server-side, the claim *offer*, "my maps" merged with the local gallery,
      share page + iframe, SVG/PDF export (free — client-side, see ADR-31).
- [ ] **P3** — `@byfauzi/map-viewer` then `@byfauzi/map-editor` npm packages.
