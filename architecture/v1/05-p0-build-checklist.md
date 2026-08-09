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
- [x] **WP-32 · The menu bar, and a rail that holds one idea** (`11` §3–§4) — Map · Edit · View ·
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
  **Inherited from WP-30: the canvas preset chips are still in the rail.** `14` §7 had them leaving
  with the routes, but their only other home is this package's `Canvas size ▸`, and removing them
  early would have left canvas size unreachable across two packages. They come out **here**, with
  the submenu that replaces them — the rail must not end up holding both.
  Acceptance is driven input per menu item and no rail scrollbar at 900 px.
  **`deleteSelection` had three copies, not two.** The design named the rail's button and the new
  Edit menu; `useSelection`'s Delete-key handler was a third, written out longhand. All three now
  call one store action, and `layersHolding` moved into the store with it, since the store became
  its main caller. **MapPanel 177 → 103 lines, Toolbar 252 → 199**, and the tool row is finally
  about one thing.
  **The View menu's two booleans are session state in the editor**, not in the scene: hiding a
  panel changes what *you* are looking at, not what the map is — the same reasoning that keeps
  layer visibility out of the undo stack. Its items `preventDefault` on select so the menu stays
  open, because the two are usually set together.
  **`Canvas size ▸` is a radio, and the no-op guard stayed** — which is a correction to `11` §3.
  The design expected a radio group to make "re-picking your current size is a no-op" *structural*,
  since a current value is not a command. **Radix fires `onValueChange` for the already-selected
  item anyway**, proved by mutation: deleting the guard fails the check at a reset confirm nobody
  asked for. What the radio really bought is that you can see which size you are on before you
  reach for it, which the three chips never showed.
  **Help's second item is a link, not an About box.** `11` §3 said "About"; a version number in a
  modal is nothing anyone needs, and `/how-it-works` is a real page that exists. It opens in a new
  tab — Help must not navigate you off the map you are drawing.
  **The shortcuts sheet is read off the handlers, not from memory** — undo/redo from the editor's
  key handler, Delete/Backspace and Escape from `useSelection`, Enter and Escape while drawing from
  `useRiverTool`, the space-drag from `MapStage`. A sheet listing something the app does not do is
  worse than no sheet.
  **33 driven checks, two mutations — and one defect the driver found in the test hooks
  themselves.** Putting `data-action="undo"` on the Edit menu item while the toolbar button still
  carried it made every existing selector ambiguous: `querySelector` resolves to document order, so
  the driver clicked the *toolbar's* button, which sat behind Radix's modal overlay, and nothing
  happened. **`11` §7's rule is that a hook keeps its value on whichever element it moves to; the
  case it does not cover is a hook that is *copied* onto a second element**, and that case fails
  silently rather than loudly. The menu items are `data-menu-item="undo" | "redo"` now, and a check
  asserts `[data-action="undo"]` matches exactly one element.
  **The other driver bug is `07` §1's own rule again**: the cross-layer marquee started at 0.3,0.3,
  which is *on the land* — so the press began a **move**, not a marquee (I5), dragged one tree, and
  reported "1 selected" as though it were a selection. Started in open water it takes 1 031 objects
  across two layers. A gesture that silently becomes a different gesture is exactly what makes a
  seeded assertion worthless.
  **And WP-30's driver had to be updated, which is the good kind of breakage**: it clicked
  `[data-action="reset"]` directly, and that control is now a menu item — present in the DOM only
  once the menu is open. The hook kept its value, as §7 requires; only its home changed. 43 checks
  still pass.

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

- [x] **WP-28 · The map at a glance** — two constants, judged by looking. **Mountains smaller**:
  `SPRITE_HEIGHT.mountain` 190 → 100, against 84 for a tree and 165 for a
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
- [x] **WP-29 · Rivers meet the sea, and each other** (**ADR-39**) — an endpoint within a
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
  **Built in `engine/riverSnap.ts`, pure and store-free**, so all of it is unit-testable in Node.
  `closestOnSegment` was extracted from `distanceToSegment` rather than copied — a snap needs the
  *place*, not just the distance, and two copies of that projection would be two places to drift.
  **The chaikin mechanism works exactly as predicted**: a fixture drives a river into the shore at
  45° and the final centreline segment comes out with **no x-component at all** — perpendicular to
  the coast, so the cap is parallel to it.
  **The coast normal is taken by *testing*, not by winding order** — the design did not say this
  and it matters: a landmass's outer ring and its lake rings wind opposite ways, so a rule that
  assumed one would push a lake-bound river mouth *inland* on the other. Two point-in-polygon
  probes at the one segment that matters, and a fixture drives a river into a lake shore.
  **D6's round cap is applied to *every* end, which is a deviation — recorded, not hidden.** D6
  asks a snapped end to stay flat while an unsnapped one rounds, but nothing at draw time can tell
  them apart: `riverRibbon` gets a `River`, and "did this end snap?" needs either a stored flag —
  a `schemaVersion` bump this same section forbids — or a live terrain dependency, which **D8
  rejects**. So D6's two halves are in tension with its own constraints. Rounding always costs
  three lines and no data; on a snapped mouth the arc sits 90 units out to sea at a 13-unit
  half-width, **3 px at fit zoom**, and reads as the river widening into the water. The upgrade,
  if anyone ever wants the distinction, is the same polygon clip §2 already names as the ceiling.
  **10 unit fixtures + 9 driven checks**, the driven ones reading the **stored points**: the tail
  is two points on the normal, a river stopping inland keeps the single point it was given, a
  tributary lands **6 map units** from a 26-wide trunk's centreline, and deleting the trunk leaves
  it byte-identical (D8).
  **The driver tripped over WP-28's own change.** Zooming out 60 steps used to land at fit; since
  ADR-38 it lands on the **floor**, half of fit — so everything drawn afterwards went down in
  different map coordinates and the tributary missed the trunk by 629 units. The zoom check moved
  last. A widened bound is exactly the kind of change that invalidates a driver's assumptions
  quietly.
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

- [x] **WP-30 · The routes** — `/maps` (the gallery as a page, titled **Your maps**),
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
  **The router is 88 lines including its comments** — `matchRoute`, a `useSyncExternalStore` over
  `location.pathname`, `navigate`, and the three things the primitive does not give you. The
  snapshot is the pathname *string*, not a parsed object, because `useSyncExternalStore` demands a
  stable identity and a fresh object every read is an infinite render.
  **The flush went into `navigate`, not into `<Link>`** — the design put it on the link, but the
  redirects are navigations too, and a guard that every *caller* must remember is the shape of a
  bug. One line, one place, and the create page's completion and the empty-list redirect inherit it.
  **The entry HTML moved to `app.html`** so `index.html` can be WP-31's landing page: with
  `appType: "mpa"` Vite serves HTML by literal path, and the ~10-line middleware puts `/maps*` on
  the app exactly as `handle /maps*` does in Caddy. **Measured equal**: `/ /maps /maps/create
  /maps/edit/abc /mapz` answer `302 200 200 200 404` on `npm run dev` and the same five on
  `vite preview`.
  **`rememberOpen`, `rememberedOpen` and `loadLatestScene` are all deleted** — a localStorage key,
  a fallback branch and a whole query, replaced by the route parameter, which was already this
  store's keyPath. Autosave lost its restore half with them, so the gallery and the create page now
  write **nothing at all**: §4.3's "no draft until the user clicks through" is true by construction
  rather than by a guard, because the hook only mounts inside the editor.
  **Two deviations, both recorded rather than quietly taken.** The **canvas preset chips stay in
  the rail**: §7's table has them leaving here, but their new home is WP-32's `Canvas size ▸`
  submenu, so removing them now would leave canvas size unreachable for two packages. And **no
  separate empty state was built for `/maps`** — while the redirect is unconditional it is
  unreachable, so the redirect *is* the empty state; P2 adds the second precondition and the
  surface together, which is where §4.2 says the real risk lives.
  **`generateOnOpen` is a store field, not a history-state flag.** `pushState` state survives a
  reload, which would regenerate the map on every refresh — D12's trap wearing different clothes.
  Session state cannot: a reload re-initialises the store, and a driven check asserts the toast
  does *not* come back.
  **Rides along: every switch in the app was unnamed to a screen reader** — WP-24's slider defect,
  one control over. A wrapping `<label>` names *labelable* elements, and Radix's switch is a
  `<button role="switch">`, which is not one. Found because the driver had nothing to select on.
  One line in `ui/controls.tsx`.
  **42 driven checks and four mutations, one per trap.** Deleting the flush leaves the record at
  `parchment=false rings=true` — the *first* edit landed on autosave's leading edge and only the
  second was lost, which is why the check makes two edits 120 ms apart: **an isolated edit is on
  disk in ~20 ms, so a single-edit check could never fail.** `pushState` on the empty-list redirect
  puts Back on `/maps/create` instead of out of the app (trap 2); `pushState` on completion puts it
  on `/maps` two entries early (trap 1); and dropping the "same id, do nothing" shortcut fails the
  undo-intact pair at `disabled: true` where an enabled button was required.
  **The undo pair is what makes the history checks discriminating**, and it needed a third edit to
  stay that way: backing out of the create page proves history *survives*, completing it proves it
  is *dropped* — but the first check ends by pressing undo, which empties the stack, so the second
  would have passed on any code at all. It re-dirties the map first.
  **The gallery's thumbnail broke, in dev only, and the shape is worth keeping.** WP-22's capture
  effect bailed on unmount. That was invisible while the gallery was a modal — the effect was gated
  on `open`, false at mount, so StrictMode's discarded pass did nothing. As a *page* it runs at
  mount: the first pass claimed the `captured` ref, started the work and was cancelled; the second
  skipped because the ref was taken. **Production was fine the whole time**, which is the worst
  shape a defect can have — nothing in a built preview would ever have shown it. The fix is a
  deletion: the ref already answers "has this scene been done", while the flag answered "is this
  effect still mounted", which a write to IndexedDB does not care about.
  **And the first mutation aimed at it passed, which was the useful part.** Restoring the guard
  *before* `planExport` changes nothing, because on a map with no landmasses nothing is awaited
  before it — it runs synchronously, ahead of React's cleanup. Only the guard **after**
  `await toBlob` is reached with `cancelled` already true. Two guards that looked
  interchangeable in the diff, and exactly one of them was the bug. The check now fails at
  **0 bytes stored** against 632.
- [x] **WP-31 · The landing page** — a static HTML file at `/`, styled with the Tailwind build and
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
  **The pages sit at the repo root, not in a `landing/` folder.** §7 named the folder; Rollup names
  its outputs after the *input path*, so `landing/index.html` builds to `dist/landing/index.html`
  and `/` would need a rewrite to reach it. One file per URL, and the mapping is the identity.
  **The stylesheet is genuinely shared, and that is measured**: all four HTML files link the same
  `assets/src-*.css`, and only `app.html` carries a `<script>`. So the landing page pays for the
  tokens once and the visitor arrives at `/maps` with them cached — which was the whole reason
  §5 asked for the app's own stylesheet rather than a hand-written one.
  **Every picture is a real export.** A driver builds each map, drives the export dialog, and
  catches the blob by wrapping `HTMLAnchorElement.prototype.click` — the one call `download()`
  makes — then downscales it to 1600 px in the same browser. **176–299 KB** for a full 4000×3000
  world as WebP; six images, ~740 KB in total, all lazy but the hero.
  **The theme is chosen, not inherited, for the images**: a single file cannot follow a palette, so
  the driver sets `mbf-theme` to light before rendering — WP-5's parchment is what the product
  looks like. The *page* still follows the theme, because it reads the same tokens.
  **Five sections carry an image and the sixth does not.** "Free, and specifically how" is a claim
  about a price, and there is nothing to photograph; padding it with a UI screenshot would also
  break D11's rule that every image on this page is an export, which is what stops the page
  promising something the renderer does not draw.
  **A `@source "../*.html"` was needed in `index.css`** — Tailwind's automatic detection is rooted
  at the CSS file, and every landing class lives one directory up. A class that silently fails to
  generate looks exactly like a styling mistake, so it is named rather than inferred.
  **Dev gained Caddy's `handle_errors` too**, gated on the `Accept` header rather than on the shape
  of the path: `/@vite/client` and `/__vite_ping` are extensionless as well, and a path-shaped rule
  hands both of them a 404 page. The *page* now matches production; the **status does not**, since
  Vite serves HTML as 200 and overwrites what the middleware sets. That one is Caddy's to give.
  **22 driven checks and two mutations — and the driver runs against `vite preview`, not
  `npm run dev`**, which is the opposite of every other driver in this repo. The dev server injects
  its HMR client as a module script into every HTML file it serves, so "this page ships no script"
  is *false in dev and true in production*: the claim is about the artifact, so the artifact is what
  it is asked of. Both mutations discriminate — a `<script type="module">` added to the page fails
  the response check *and* the network check, and deleting the stylesheet link fails all four theme
  measurements at `rgba(0, 0, 0, 0)` where the app paints `rgb(238, 241, 236)`.

**Batch 9 — the size of what you place.** Raised after Batch 6 shipped, and the direct twin of
WP-27: `anchorAt` hardcodes `scale: scatter ? 1 + jitter(0.28) : 1`, so *how big* a placed sprite
is has no control at all — the same "constant pretending to be a decision" that rotation was.
**No design doc yet**, like Batch 4 before ADR-33.

- [x] **WP-33 · How big is the thing you are about to place** — a size control in the tool options
  for mountains, forests and icons, live for **both** scatter and place. It writes `object.scale`,
  which is the field the resize handles already edit ([transform.ts:83](../../src/scene/transform.ts#L83)
  multiplies it) — so the knob sets the starting value and a drag changes it afterwards. **The two
  do not compete**: drawn height is `SPRITE_HEIGHT[kind] × object.scale`
  ([raster.ts:128](../../src/sprites/raster.ts#L128)), the constant being *what a mountain is* and
  the scale *what this mountain is*.
  **A multiplier shown as a percentage, not map units.** Labels and rivers store absolute sizes
  because their size *is* the stored number; a sprite has a base constant underneath, so an
  absolute knob would have to divide by `SPRITE_HEIGHT` and would silently change meaning whenever
  the art is retuned — which WP-28 just did, twice.
  **Built per kind, not one global size** — the rail is contextual, and wanting large mountains
  beside small trees is the ordinary case. Labels are absent: they already carry a size in map
  units of their own.
  **The double duty was dropped, and the reason is a real disanalogy.** The plan was to follow the
  label-size slider and resize a selection when there is one. But a label selection is *one object
  with one size*, while a sprite selection is dozens with deliberately different ones — "set them
  all to 150%" would flatten the very jitter scatter exists to create. Resizing what is already
  placed is the frame's handles, which do it per object and already work. Recorded rather than
  silently skipped, because the entry above promised it.
  **D1 settled: the generator is not in this package, and the world code does not move.** This
  looks like `12` D4 and is not. D4 arose because WP-27 *replaced an input the generator was
  already using* — its rotation jitter — so the generator needed somewhere to keep its own. Here
  the generator's `1 + jitter(0.28)` is untouched, so there is no new world input and nothing to
  add to the code. **No `w3-`.** If generated sprite size is ever wanted as a control, that is its
  own decision with its own cost.
  **The `±0.28` spread stays a constant**, marked with a `ponytail:` comment: WP-33 gave "how big"
  a knob and left "how varied" alone, which is the same complaint one level down and nobody has
  asked yet.
  **10 driven checks reading the scene, and one mutation.** Placing at 150% stores `scale` 1.5
  while the sprite already down stays at 1; a scatter at 150% comes out spread **1.15–1.88** rather
  than around 1; forests keep their own value while mountains remember theirs. Making `anchorAt`
  ignore the multiplier — the way it behaved before — fails two of them, at 1.00 where 1.50 was
  required.


**Batch 11 — how close two may stand.** Raised after Batch 8: a scattered mountain half-buried
behind a sibling is nobody's intent, and the brush had no way to prevent it. **No design doc**,
like Batches 4 and 9 — the whole change is one predicate and one slider.

- [x] **WP-35 · The scatter brush leaves room** — `crowded()` in `canvas/objectHit.ts`, tested in
  `scatterAt` before the candidate is added. **Nothing is deleted and nothing is moved**: a
  crowded candidate is simply not placed, which is why this was built rather than the
  cull-what-is-already-down version that prompted it — principle 2 says every object is the
  user's, and this never destroys one.
  **The brush already had a spacing rule, and it was the wrong one.** `step()` gates the *cursor
  path* at `max(brushSize × 0.42, 12)`, and then `scatterAt` jitters the drop by up to half the
  brush across — so two consecutive sprites could still land on top of each other, and a second
  pass over the same ground remembered nothing of the first. The generator never had the problem:
  `poisson()` rejects against *accepted points*. This is that rule, borrowed. The path gate stays,
  because it limits **work** and this limits **result**.
  **The radius is a fraction of drawn height, and pairwise** — the mean of the two sprites'
  heights. A fraction because `SPRITE_HEIGHT` has been retuned twice and an absolute spacing would
  silently change meaning each time (WP-33's lesson, one level along); pairwise because
  `spriteScale` is a knob, so 300% mountains beside 50% ones is an ordinary map and a single
  radius would be visibly wrong on it.
  **Per kind, and the defaults are not new numbers**: 0.58 for mountains and 0.40 for trees are
  the generator's own accepted ratios — `scatter.ts` spaces mountains at 58 against a 100-unit
  sprite and trees at 34 against 84. One shared fraction was the alternative and would have been
  smaller; it cannot express that whoever tuned those wanted peaks further apart than trees
  relative to their own size. **0 is off**, and it restores the pre-WP-35 brush exactly, so the
  escape hatch needs no control of its own.
  **`place` is exempt.** A deliberate click must never be silently refused — the same rule that
  lets the frame's handles overrule the size knob — and the slider is *absent* rather than
  disabled in that mode, so nothing implies otherwise.
  **The generator is untouched**, the same disanalogy WP-33's D1 recorded: its constants are its
  own and its world code is a reproducibility contract, so a brush knob adds no world input and
  there is **no `w3-`**.
  **6 unit fixtures, 10 driven checks, 2 mutations.** The driven shape is **the same stroke three
  times**, because one pass proves nothing — a sparse result could just be a sparse brush. With
  spacing off the passes add **+30 +30 +30**; with it at maximum they add **+25 +13 +5**. Deleting
  the rejection turns the second run into +30 +30 +30 and fails both it and the size check;
  replacing the pairwise mean with the candidate's own height fails the unit fixture built for it.
  **The first driven attempt was not decisive and the numbers say why.** A single-line stroke drops
  ~18 candidates and the jitter spreads them over a band wide enough that a second pass legitimately
  finds gaps: 6 → 9 looked like a weak pass rather than a working rule. Rastering the stroke over an
  *area* is what turned "fewer" into **saturation**, which is the claim actually being made.

**Batch 10 — the mouth takes the coast's shape.** Raised on looking at WP-29's result: a straight
cap on the coast *tangent* reads as a spike through the shoreline. **ADR-41**, which amends ADR-39
and lifts the ceiling that document named.

- [x] **WP-34 · The river is masked by the land** — `riverOutline` intersects the ribbon with the
  landmass multipolygon at draw time, so the mouth is trimmed to the coastline's own shape rather
  than cut across it. `polygon-clipping` was already a dependency and the mask needs no union —
  the library takes a multipolygon, so it is `landmasses.map(landmassToPolygon)`.
  **Derived, not stored**, for the reason ADR-13 already gave for coastal rings: a stored outline
  goes stale the moment a control point moves, so every transform would re-clip anyway. The scene
  contract does not move and there is **no `schemaVersion` bump**.
  **D8 is narrowed, not overturned.** A river's *geometry* still depends on nothing — the stored
  points are untouched and a snapped mouth stays draggable. What depends on terrain is the
  *drawing*, the same relationship rings already have with land. The cost is paid explicitly: the
  rivers layer's cache key includes the mask, so a moved coastline re-renders the rivers instead
  of leaving a stale mouth on screen.
  **It settles `13` D6 by construction and retires WP-29's recorded deviation.** There is nothing
  left to decide: a mouth crossing the coast has its round cap cut off *by the coastline*, and one
  reaching open land keeps it. No flag, no dependency, no schema field.
  **The source comes to a point** — `SOURCE_FRACTION` 0.3 → 0, so a tapered river fades in rather
  than starting as a blunt stub. An untapered river stays uniform, which is what "no taper" means.
  **Masking against other rivers was rejected**: over water, two rivers each clipped to the other
  reduce *both* to their overlap. The confluence needs no help — ADR-14's ribbons are unstroked
  and share a colour, so they already merge seamlessly.
  3 clip fixtures on top of WP-29's 10, and WP-29's 9 driven checks still pass **unchanged** —
  they read stored points, which the mask deliberately does not touch. Judged where it had to be:
  by looking at the mouth.

**Batch 12 — the chrome says what the tool does.** Five complaints raised together after Batch 11,
all of the same kind: a control on screen that does not apply to the thing in your hand, or a bound
that stops short of where the last package moved its sibling. No design doc.

- [x] **WP-36 · Five that were saying the wrong thing**
  1. **The brush ring hides while the wheel turns.** `zoomAt` pins the map point under the pointer,
     so the ring is *usually* still honest — but at the pan clamp that pinning gives way and the
     ring drifts off the cursor for as long as the zoom keeps hitting the edge. It returns on a
     250 ms idle, or sooner the moment the pointer moves and is truthful again — **and it
     returns on a re-derived point**: `cursor` is a *map* point and only a mousemove ever made
     one, so the pointer's client position is kept alongside it and the map point is recomputed
     once the last zoom has rendered. That fixes the `x · y` readout at the same time, which had
     been telling the same lie for as long as the ring.
  2. **Panning gained a bound of its own.** ADR-38 let the canvas shrink to half of fit so it could
     be seen as an object with edges, and left `clampPan` alone — so zooming *in* put the map edge
     back as a hard wall, and a map smaller than the viewport was pinned dead centre with nowhere
     to go. **`PAN_KEEP = 0.5` of whichever is smaller, the map or the viewport**, which is what
     makes one number mean the right thing at both ends of the zoom range: zoomed out, half *the
     canvas* may leave the screen; zoomed in, the map must still cover half *the screen* — slack
     enough to work at the coast, and it stops the map being flicked out of sight entirely, which
     a fraction of the map's own size would allow once the map is several screens wide.
     **The centring branch is gone, and that was the point.** `clampPan` used to centre any axis
     the map did not fill, which is a *framing* decision wearing a clamp's clothes: zooming out to
     inspect the coast you were working on threw away the very framing you were pulling back to
     see. Framing is now `centred()`, called where a fit or a reset happens — and it had to be,
     because the clamp was the only thing centring the map on first paint.
     Costs no memory: `padRect` clips every cache rect to the map, ADR-38's own argument.
     **Measured**: pushed to the wall the stage's left edge reads map x **-265**, the map's own
     left edge stops at the stage's **centre**, and zoomed out the canvas can be shoved until map
     x **1915** sits at the right edge of a 4000-wide canvas — half of it off screen.
  3. **Rotation jitter left the terrain rail.** It was gated on `objectTool === "scatter"` alone,
     and terrain has no `objectTool` of its own — it keeps whichever was last in hand — so the rail
     offered a rotation knob to a brush that paints polygons. Gated on `spriteKind` now, like Size
     and Spacing beside it.
  4. **The sea brush is a global tool.** It was rendered only on terrain, so reaching it from any
     other layer took two clicks and the first one was the *land* brush, which resets it. It is
     always in the mode group now and takes you to the terrain layer, because that is the geometry
     it edits — reachable everywhere, honest about where it puts you. **Biome to paint** and **On
     overlap** leave the rail while it is in hand: one is what the land brush paints, the other
     governs land landing on land, and the sea brush does neither.
     **And both terrain brushes now answer to the terrain layer's own flags** — hidden as well as
     locked, which is `12` D3's rule (hiding a layer protects it) reaching the one tool that had
     never been told. The rail says which, because otherwise the stroke simply does nothing.
  5. **Erase shows the disc and nothing else.** It is a global mode, so the rail was still offering
     the *active layer's* controls underneath it — a river width slider above an eraser, text size
     on the labels layer, coast detail and the biome palette on terrain.
  **31 driven checks and three mutations.** Setting `PAN_SLACK` to 0 puts the wall back at the map's
  own edge — map x **5** at the stage edge against **-130** with the slack. Letting hidden stop
  protecting terrain fails three: the ring, the paint, and the positive control after it.
  **And a third mutation that passed first, which is how the cursor check found its own hole.**
  Deleting the re-derivation changed nothing in a check that zoomed *in* at a corner: `zoomAt`
  pins the map point under the pointer, and only `clampPan` overruling it can break the pinning —
  which zooming in never does, because the pan it wants is the legal direction. Zooming **out**
  while panned hard against a wall is where the two disagree, and there the stale point reads
  **308,1593** against the truth of **3408,2255**.
  **And the gesture lag it exposed, measured and fixed.** Zoom and space-drag both hitched, and
  the cause was one line: the cache rect was keyed on the exact scale, so **every wheel step
  re-rendered all five cached layers** — five viewport-sized draws over every object on the map.
  Three changes, all in how the cache is invalidated rather than in what it holds:
  **resolution goes stale while the wheel turns** (Konva scales the bitmap, so it softens rather
  than breaks, and the settle re-caches once — the same idle the ring already waits for);
  **containment still forces a re-cache mid-zoom**, which is not optional, since a zoom-out that
  outgrows its bitmap would show the map beyond it as *missing* rather than blurred; the pad grew
  **0.25 → 0.5** so a drag travels twice as far before it re-caches; and **an empty layer is
  treated as live**, because caching one allocated a viewport-sized canvas to hold nothing, and a
  fresh map has four.
  **Measured on one pinned world** (`w2-483920104-0.45-0.60-single-auto-0.50-0.50-5`, 920 objects,
  1440×900 at dpr 1, frame times from `requestAnimationFrame`) — the same map before and after,
  because the first attempt compared three different rolls of the generator and the fastest run
  happened to be the smallest world:

  | | before | after |
  |---|---|---|
  | zoom in, p95 · max | 66.7 · 83.4 ms | **16.7 · 33.3 ms** |
  | zoom out, p95 · max | 116.6 · 150 ms | **16.8 · 33.4 ms** |
  | space-drag, p95 · max | 249.9 · **749.9 ms** | **133.3 · 200.1 ms** |
  | cached bitmaps | 11.5 MB | **7.7 MB** |

  The median was 16.7 ms throughout, before and after: this was never sustained slowness, it was
  a hitch, which is why it read as lag rather than as a slow app.
  **Then a CPU profile found the rest of it, and it was not what any of the above assumed.**
  Every guess so far had been about *how often* the cache is rebuilt; the profile said the cost
  is in **what `cache()` builds**. Konva allocates a *second* full-size canvas for hit detection
  on every cache — `HitCanvas → setSize → scale` was **51% of a whole space-drag**, against
  **0.4% in `drawLayer`**, the function actually drawing the map. Nothing in this app reads it:
  the layer and its shape are both `listening={false}`, and per-object picking is rbush's job
  (ADR-16). It cannot be switched off and `0` falls back to `1`, so `hitCanvasPixelRatio: 0.01`
  makes it a few pixels instead of a few megapixels.

  | | before | cache invalidation | + hit canvas |
  |---|---|---|---|
  | zoom in, p95 · max | 66.7 · 83.4 ms | 16.7 · 33.3 ms | **16.8 · 16.8 ms** |
  | zoom out, p95 · max | 116.6 · 150 ms | 16.8 · 33.4 ms | **16.7 · 16.8 ms** |
  | space-drag, p95 · max | 249.9 · **749.9 ms** | 133.3 · 200.1 ms | **16.7 · 33.3 ms** |

  **Not one frame over 33 ms in any of the three gestures**, from a 750 ms freeze. The lesson is
  the ordinary one: two rounds of reasoning about the right mechanism moved the number 3–7×, and
  ten minutes of profiling moved what was left to the floor. **Profile before the second guess.**
  **Two more driver bugs, both the same lesson twice.** The pan check first dragged a fixed distance and
  never reached the wall, so it measured nothing — `07` §1's overshoot rule, fixed by dragging until
  the reading stops moving. And the hidden-layer check first compared the **landmass count**, which
  cannot fail when the new blob merges with the old — and the viewport was still deep in the
  zoom the pan check left it at, so two strokes at the same stage fractions landed close enough in
  map units to become one. **Undo depth is the merge-proof question**: a refused stroke files no
  step. Its positive control is what stops it passing on a brush that simply stopped working.

## Later phases (see the phase prompts)

- [ ] **P1** — self-contained HTML embed export + `.map.json` import/export.
- [ ] **P2** — Zitadel auth, Go+Postgres API, **opt-in per-map cloud sync** with the cap
      enforced server-side, the claim *offer*, "my maps" merged with the local gallery,
      share page + iframe, SVG/PDF export (free — client-side, see ADR-31).
- [ ] **P3** — `@byfauzi/map-viewer` then `@byfauzi/map-editor` npm packages.
