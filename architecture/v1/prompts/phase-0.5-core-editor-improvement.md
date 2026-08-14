# Core-Editor Improvement — Agent Work Order

> **You are an AI coding agent.** This file is the work order for **enhancements to the
> Phase 0 core editor** — changes too large to be a bug fix, and too specific to the editor
> to belong in P1–P3. Work **one package at a time**, in the order given inside a batch.

## What this file is, and what it is not

**Not a phase with an end.** P0–P3 each finish; this file stays open. It is the standing home
for core-editor work that arrives after P0 shipped, so improvements have somewhere to live
without reopening `phase-0-core-editor.md` (whose scope and definition of done are frozen)
and without being smuggled into a phase that is about something else.

- **Numbering continues P0's sequence** — WP-14 onward. `phase-0-core-editor.md` owns
  WP-0…WP-13; this file owns WP-14 and up. One sequence, so "WP-15" is unambiguous
  everywhere.
- **Nothing here blocks P1–P3**, and P1 does not block anything here. A package touches the
  editor; the later phases wrap, host and package the editor. Pick up a batch whenever it is
  worth more than the next phase's work — including after P1 has started.
- **Every package is self-contained.** It has a design document, acceptance criteria, and
  fixtures, and it can ship alone.

## Required reading

Always:
- `../01-system-design.md` — the system.
- `../02-scene-data-model.md` — the scene contract. **This is law.**
- `../03-architecture-decisions.md` — the *why*. If a package's design contradicts an ADR,
  the ADR wins until an ADR supersedes it.
- `../07-interaction-invariants.md` — **mandatory** for anything pointer-driven, which is
  most of what lands here.
- `../05-p0-build-checklist.md` — the tracker. Tick the box when a package passes.

Per batch: **the design document named by the batch.** Do not start from this file alone; it
says what to build and when it is done, not why the design is shaped that way.

## Hard constraints

The P0 constraints did not expire. Restated because a later package is exactly where they get
forgotten:

- **The scene JSON matches `02-scene-data-model.md` exactly.** Never change the shape without
  bumping `schemaVersion` **and** shipping the `migrate()` step in the same commit.
- **Coastal rings are derived, never stored.** Coordinates are map-space. View state
  (zoom/pan/tool/selection) is never serialized.
- **Perf budget: smooth at ~1–2k objects.** Active layer live, every other layer a bitmap
  cached at **viewport** resolution. Heavy geometry stays in the Web Worker, and a worker task
  cannot be interrupted once started — never queue work for a state that has already been
  replaced.
- **No backend, no network.** That is P2's business.
- **Driven input is the evidence.** If a package's acceptance says click, drag or select, a
  screenshot of seeded state proves nothing (`07` §1). Drive real pointer input.
- **Styling follows `06-frontend-styling.md`** once WP-13 has landed it: Tailwind v4 with the
  `mbf:` prefix, `tailwind-variants`, Radix primitives, tokens shared with the canvas.

## How to work a package here

1. **Read the batch's design document first.** Then this file's package entry, which is the
   short form.
2. **Settle the open decisions the design document lists, with the human, before writing
   code.** They are listed because inferring them produces work that gets thrown away.
3. **Packages in order within a batch.** They are ordered by dependency, not by appeal.
4. **Fixtures before wiring**, exactly as the geometry stages were built.
5. **One package per commit.** Tick its box in `../05-p0-build-checklist.md`, then stop for
   review before the next.
6. **Record what you deferred**, in the least losable place — see `../../DEBT.md` for the
   three destinations. A shortcut at a line gets a `ponytail:` comment there; debt a later
   package will pay goes into that package's entry so it becomes an acceptance criterion; only
   what has neither gets a ledger row. A shortcut you cannot write a "Retire when" for is a
   decision — write an ADR instead.

---

## Batch 1 — Terrain as objects (WP-14 … WP-17)

**Design:** `../08-terrain-as-objects.md` — read it in full. **Decision:** ADR-25.
**Prerequisite:** WP-13, because every package here needs real UI (a biome palette, a rail
settings group, toasts carrying actions).

**Settle first:** **D4** (does `ringGap` stay global when land is scaled), **D6** (does the
brush paint the chosen biome directly). See `08` §8. **D1 is settled — yes**, two interaction
models, decided with Batch 2 (ADR-28): a shared frame over land and sprites is exactly what it
licenses. WP-15 is therefore unblocked.

**What this batch is about.** Landmasses are path-based: absolute geometry with no anchor and
no footprint, deliberately excluded from the sprite selection stack by invariant I9. This
batch teaches the editor a **second interaction model** — hit-tested by path, transformed by
baking into points — so land can be selected, coloured and moved. The tiers split on which
operations are lossless: translation and rotation are rigid, scale is not.

**The invariant that keeps it cheap:** landmasses never overlap at rest. Every drop resolves
overlap, so at most one landmass contains any point — which is why the hit-test needs no
"topmost" rule and the absent `z` field never comes up. Do not break it.

### WP-14 · Terrain select & colour
Point-in-polygon hit-test (`pointInPolygon` + `landmassToPolygon` already do this); a
`select` tool on the terrain layer; click / shift-click / marquee-by-**containment**;
selection draws as a **highlighted coastline with no handles**; properties strip with the
biome palette, name and delete; the brush paints the chosen biome.

**No handles in this package.** A frame whose handles do nothing is the exact failure I9
describes. Handles arrive with WP-15, which makes them work.

- **Acceptance:** clicking a small island that sits inside a crescent continent's bounding
  box selects the island, not the continent · shift-click deselects · the palette recolours
  the selection in one undo step · delete removes a landmass and the rings re-derive without
  it · driven input, not a screenshot.
- **Fixtures:** `08` §4 (T1).

### WP-15 · Terrain move & rotate
Rigid transforms baked into `path`/`holes`; handles appear; ring derivation **suspends during
the drag** (it costs 119–488 ms against a 16 ms frame) and fires once on drop, with the rings
faded so the freeze reads as deliberate; **overlap policy radio, default "keep apart"**.

- **Acceptance:** a continent moves rigidly with its lakes · a 360° rotation round-trips
  within `1/SCALE` · three selected landmasses move and undo as one step · exactly one ring
  derivation per drop, not per frame.
- **Fixtures:** `08` §4 (T2).

### WP-16 · Terrain resize
Scale, then **re-simplify** at the scene's `coastDetail`, so a landmass scaled 4× does not
end up 4× coarser than every other coast on the map. Re-simplification runs in the worker on
drop.

- **Acceptance:** point density after a 4× scale is comparable to a freshly committed coast
  at that size · repeated scale cycles do not grow the point count without bound.
- **Fixtures:** `08` §4 (T3).

### WP-17 · Carve a strait
The third overlap outcome: subtract the other landmass grown by a gap, then **roughen the
machine-straight cut** so it reads as coastline. Needs the **≥20 % area remains** guard — a
carve that would erase what the user just dragged falls back to "keep apart".

- **Acceptance:** two dropped landmasses end separated by a channel the ring engine fills
  with bands · a carve that would annihilate the dragged landmass falls back instead · a
  carve that splits one landmass into several reports it in the toast, larger piece keeping
  the id (ADR-10).
- **Fixtures:** `08` §5.

---

## Batch 2 — Selection across layers (WP-18, WP-20, WP-19)

**Design:** `../09-selection-across-layers.md` — read it in full. **Decisions:** ADR-28,
ADR-29. **Build order is WP-18 → WP-20 → WP-19, which is not numeric** — WP-20 was decided
after WP-19 was written down and belongs before it.
**Prerequisite:** WP-13 for WP-18 (it regroups the toolbar WP-13 built); nothing for WP-20;
**WP-17 and WP-20** for WP-19.

**Settle first:** nothing. Every decision this batch needed was taken in the review that
produced `09` — see its §6, which records the rejected alternatives too.

**What this batch is about.** The toolbar flattens two orthogonal axes — *what you are
making* (the six layers) and *what the pointer does* (Select, Erase) — into one row of
eight peers. That is why Select reads as a broken sibling of Mountains and why "disabled on
Terrain" feels arbitrary. Underneath the presentation problem is a real one: the Select tool
is scoped to the active layer, which is **narrower than invariant I9**, whose whole promise is
that anything with a footprint is selectable and transformable with no further work.

**Why WP-18 is small.** The index, the undo stack and the transforms already operate on plain
`SceneObject[]`; `useSelection` binds to the active layer in exactly four places; and
`SpatialIndex` already ignores anything without a footprint. This is mostly deletion.

### WP-18 · Selection, unlinked from the layer
Toolbar splits into mode and create groups; Select hit-tests every **visible, unlocked** layer
at once and is never disabled; lock and visibility become how a selection is scoped; mixed
selections show common controls only; a layer is **live when active *or* holding a selected
object**; Erase keeps its behaviour and relabels itself **"Sea brush"** on Terrain.

**Ships alone and blocks nothing** — take it before, after or between Batch 1's packages.

- **Acceptance:** a marquee spanning mountains, forests, icons and labels selects from all
  four and moves them as one undo step · a locked or hidden layer contributes nothing to a
  click or a marquee · Select is never disabled · text size appears only when the selection is
  all labels · bring-forward restacks each object **within its own layer** · **measured**:
  drag frame time with a selection spanning four layers, recorded with its object count ·
  driven input, not a screenshot.

### WP-20 · Rivers gain a frame — *the two-model pilot, build before WP-19*
A selected river draws the ordinary frame **and** keeps its control points. `objectBounds`,
`frameOf` **and `selectablePool`** grow a path branch — widen two of the three and you get a
river that frames but cannot be picked. `transform.ts` stops returning path objects untouched;
**scale multiplies `width`** as well as the points.

**The box is feedback and takes no press at all** (S8). Picking stays path-based, *and so does
the move*: I5's frame-interior rung is inert for a path-only selection, because on a
corner-to-corner river that box is ~95% open water. Handles and stalk stay live, the water
stays live, the empty interior falls through to the marquee. **The cursor resolves the same
precedence** (S9, I4) — a pointer showing "move" where a press marquees is bug #2 with the
parts swapped.

**Why this one first.** Every constraint that makes WP-19 hard is absent: rivers overlap
deliberately (no overlap policy, so **no shared-delta problem**), never get rings (nothing to
freeze), and carry the user's own control points rather than a simplified coast (**scale is
lossless**). All three transforms are lossless on a river — the only type in the scene where
that holds — so this is where the two-model frame gets debugged.

**The rung to get right:** a river's **control points outrank the frame's handles**. They
collide at the ends, because an endpoint is usually what defines the corner a handle sits on.

- **Acceptance:** a selected river shows a frame *and* its points, and dragging a point still
  reshapes rather than moves · dragging inside the frame moves it rigidly as one undo step ·
  a 360° rotation round-trips · scaling 2× doubles the drawn width as well as the length · a
  river and the mountains along it select and move together · **pressing open water inside the
  frame starts a marquee with no modifier held, and the cursor there says so** · driven input,
  sweeping the pointer to read `.mbf-stage` cursors (`07` §1) because the cursor is half of
  what is asserted.

### WP-19 · Terrain joins the selection
One frame over land and sprites, which is only honest once WP-16 makes every handle move
geometry — and on the model WP-20 has already proved on rivers. WP-14's coastline highlight
stays, **additive** to the frame. Hit precedence is footprint first, landmass as fallback; the
marquee is asymmetric on purpose — intersection for sprites, containment for land; a
double-click on a landmass selects it and its contents.

**The risk sits in one item:** overlap resolution runs first and its **resolved delta** goes to
every object in the drag, or the mountains end up off the land they were standing on.

- **Acceptance:** a landmass and its mountains move together and stay registered when "keep
  apart" slides the drop back · clicking a mountain on a coast selects the mountain · a marquee
  clipping a continent's corner takes its trees and not the continent · double-click selects
  land plus contents · one ring derivation per drop · the biome palette appears for a mixed
  selection and recolours only the land · driven input.

---

## Batch 3 — The drawn shape decides (WP-21)

**Design:** `../10-hit-testing-precision.md`. **Decision:** ADR-30. **Prerequisite:** none —
independent of Batches 1 and 2, and composes with WP-20 rather than competing.
**Settle first:** nothing; `10` §6 records F1–F5.

**What this batch is about.** Sprites are picked by their bounding rectangle, and the
rectangle is a poor stand-in for the shape. Measured: ink fills **53%** of a mountain's box,
**50%** of a tree's, and **28–88%** across the icons — **compass is 28%**, worse than any
mountain, because a four-armed star is mostly the gaps between the arms. Same complaint
WP-20 answers for rivers, on objects that are not paths.

### WP-21 · Precise picking, honest boxes, a guarded parser
Four items, in `10` §5. **Silhouette as a tie-break** — rbush narrows by box, a path
containment test prefers the candidate whose artwork covers the point, topmost-by-Y stays the
fallback. **Labels are exempt** and keep box picking, because the gaps between words are part
of the target. **`spriteExtent` walks the path and flattens curves** instead of scraping
numbers with a regex, which tightens every box for free — a quadratic never reaches the
control point the regex measured to. **An unsupported path command fails loudly**, which is
the safety net `../HOW-TO-CHANGE-SPRITE-ART.md` assumes.

**Item 4 is independent and can ship alone, first.** It is five lines and it protects an
asset swap, which is a thing that happens without warning.

**Keep bounds canvas-free** (P4): they are unit-tested in Node, so flattening is arithmetic
over the path string. Only the picking `Path2D` lives in the browser.

- **Acceptance:** clicking inside a compass's box but between its arms selects nothing, and
  clicking an arm selects it · two overlapping mountains, a point inside both boxes but one
  silhouette, picks that one · an isolated tree still tolerates a near-miss · a label is
  still picked from the gap between two words · marquee still selects by box · **re-run `10`
  §2's fill measurement and record the tightened numbers beside the old** · an arc or a
  relative command fails a test · driven input, reading `.mbf-stage` cursors so the pointer
  agrees with the new precedence.

---

## Batch 4 — More than one map (WP-22) — **complete**

**Design:** none yet — the decisions live in **ADR-33**; write `11-…` if this grows past one
package. **Decision:** ADR-33 (and ADR-31 for why local is uncapped). **Prerequisite:** none.
**Settle first:** nothing.

**What this batch is about.** `persistence/drafts.ts` stores drafts as a **keyed collection**
— `meta.id` is the keyPath, deliberately, so P2 can claim into an account — but the only two
operations are `saveScene` (put one) and `loadLatestScene` (reverse cursor, newest only).
Nothing lists it and nothing creates a second draft, so in practice the editor has **one
continuous working copy** and a user's second map is unreachable. The store is already the
right shape; what is missing is the query and the UI.

This became load-bearing rather than nice-to-have when cloud sync went **opt-in per map**
(ADR-33): local-only maps are now a first-class and potentially numerous thing, and
"unlimited local drafts" is the headline of the free tier (ADR-31) — meaningless if you
cannot switch between them.

### WP-22 · The local map gallery  *(built)*
Add **`listDrafts()`** over the existing `updatedAt` index, and a gallery UI listing local
projects with title, thumbnail and updated time: **new map · open · rename · delete**. Keep
a local thumbnail per draft so the list does not have to rehydrate every scene to render.

**Local only.** A merged view of local *and* cloud maps with sync badges is the target shape,
but the cloud half belongs to P2's WP-3 — build the list so a second source can be folded in
without a rewrite, and stop there.

**Deleting a local draft is not deleting a map.** It removes this device's copy; if the map
has been synced, the cloud row is untouched (the mirror of ADR-33's rule that deleting a
cloud map never touches the local copy). Say so in the confirmation, or the two deletes will
be read as one.

**Do not evict on the user's behalf here.** LRU pruning of synced drafts is WP-3's, and it
must never touch a draft that is local-only or ahead of cloud.

- **Acceptance:** create three maps, switch between them, and each reopens with its own
  geometry and title · a renamed map keeps its `meta.id` · deleting one leaves the others
  and the newest-first order intact · a reload restores the map that was open, not merely
  the most recently written · driven input for open/switch/delete, per the house rule.

#### As built

**The package found a live defect, not just a missing feature.** `createEmptyScene` mints a
fresh `meta.id`, and autosave keys on it — so the single "New canvas" button had been writing a
*new* record and stranding the previous map on every click since WP-12. The gallery's first job
is surfacing drafts that already existed. The button split into **New map** (fresh id, not
undoable — nothing is destroyed) and **Reset canvas** (same id, confirm plus undo), recorded as
**ADR-35**, which also states why rename is deliberately not undoable: `diffScene` never walks
`meta`, so `record` would file a step carrying nothing.

**The boot path was the real work.** "A reload restores the map that was open" is not satisfied
by `loadLatestScene`; the open map's id is remembered in localStorage — an id, not scene data,
so WP-12's rule holds — with the newest-draft fallback for a draft deleted since.

**Measured, and it settled the one schema question:** listing 20 drafts of a 152 KB scene costs
**7.4 ms**, against 1.0 ms with summaries in their own store. A 7× ratio and an irrelevant
absolute, so no `DB_VERSION` bump; the ceiling is a `ponytail:` comment in `drafts.ts`.

**Two driven checks did not discriminate on the first attempt** — the same trap `07` §1 keeps
recording. "A reload restores the open map" could not fail, because *opening* a map re-saves it
and so makes it the newest write as well; the check now ages another record so the two answers
genuinely differ. And the thumbnail check passed against a mutation that wiped thumbnails,
because the gallery re-renders one on open and masked it — it now reads the **record** instead
of the UI. 22 driven checks, 5 mutations, all caught.

---

## Batch 5 — The editor shell (WP-23, WP-32)

**Design:** `../11-editor-shell.md` — read it in full. **Decision:** ADR-36, amended by ADR-40.
**Prerequisite:** WP-13 (real UI) and WP-22 (the gallery).

**Settle first:** nothing. The three behaviour changes inside WP-23 are decided in `11` §5, and
ADR-40 settles what the menu bar contains.

> **This batch is split, and Batch 8 lands between its halves.** ADR-40 gives the app routes,
> which changes what the menu bar holds — building all of `11` first would mean building two menu
> items and deleting them a package later. **WP-23 is `11` §5** (the generate dialog, the world
> code, the switch contrast fix) and goes **first**, because WP-30's `/maps/create` page mounts the
> same generate form. **WP-32 is `11` §3–§4** (the menu bar and the slimmed rail) and lands
> **after** Batch 8.
>
> **Build order across the two batches: WP-23 → WP-30 → WP-31 → WP-32.**

**What this batch is about.** The right rail is one scrolling column holding five unrelated
concerns — the layer list, render settings, the whole world generator, document actions, and
canvas presets. Every control in it works; they are filed by the order they were built in
rather than by kind. The tell is two **Generate** buttons, one in the toolbar and one in the
rail: that is what a panel looks like once it has become the place things go when there is
nowhere else. ADR-28 fixed the *tools* in the toolbar and deliberately left the chrome alone.

**The rule the whole batch applies:** a menu holds commands and rarely-changed settings; a rail
holds live state you steer while looking at the map. Ring count and gap stay in the rail
because they re-derive the bands live; land amount and sea level go in the dialog because they
only apply on the next Generate.

**Nothing here is pointer-driven geometry.** No scene-shape change, no `schemaVersion` bump, no
new invariant. It is the largest diff in this file and the lowest risk in it.

### WP-23 · The generate dialog and the world code  *(`11` §5)*
ADR-21's generate confirm folds into the generate dialog — the dialog carries the warning line and
its primary button reads **"Replace map"** on a non-empty scene, **"Generate world"** on an empty
one, so a modal on top of a modal goes away. `switchRoot` gets an off state you can actually see,
which is why the sea-level slider looked permanently dead (the gate is correct and stays — one
variant change repairs every toggle in the app). And the seed becomes a `w1-` **world code**
carrying all seven world inputs, because a bare copyable seed reproduces nothing when the other
knobs differ — and fails silently doing it.

**Build the generate form as one component with two containers.** WP-30's `/maps/create` mounts the
same thing on a page where the scene is always empty, and §5.1's branch is already exactly that
difference. Two forms would be two places to change a generator parameter.

**Canvas size and `coastDetail` stay out of the world code**, as `11` §5.3 specifies. That is what
lets the create page pick the canvas first and then accept a code for everything else.

- **Acceptance:** Generate on a non-empty scene reads "Replace map" and carries the warning line,
  on an empty one neither · a world code copied from one session and pasted into another produces
  the same scene · an **off** switch is distinguishable from the panel behind it in both themes,
  **measured at ≥ 3:1** rather than eyeballed, and the sea-level slider still enables only when its
  toggle is on.
- **Fixtures:** `worldCode` round-trip, plus rejection of a garbage string and a `w2-` string.

### WP-32 · The menu bar, and a rail that holds one idea  *(`11` §3–§4 — after Batch 8)*
Map · Edit · View · Help in their own row above today's tool row; the right rail drops to
**Layers + Appearance**; the bottom autosave strip is absorbed into the menu bar, so two header
rows cost no height. Radix `DropdownMenu`, already installed — keyboard navigation, Escape,
typeahead, focus return and `role="menu"` come from the primitive, so write none of it.

**The `Map` menu holds four items, not six** (ADR-40): `Canvas size ▸`, `Reset canvas…`,
`Generate world…`, `Export image…`. `New map` and `Open Map…` belong to WP-30's gallery page — a
menu holds commands about **this** map, the gallery owns **which** map. The **brand mark `[M]`
links to `/maps`**, and it is load-bearing rather than decorative: Back only works if you arrived
from `/maps`, which a bookmark straight to `/maps/edit/{uuid}` did not.

**Keep every `data-*` hook** on whichever element it moves to. They are menu items now rather
than buttons, which changes the tag and not the selector, and the CDP recipes in
`../07-interaction-invariants.md` drive them. `data-action="new-map"` and `"gallery"` keep their
values on **WP-30's** surfaces.

- **Acceptance:** every menu opens on click, closes on Escape, and each item runs the command it
  names — **driven input asserting the store or scene changed**, not a screenshot ·
  `Canvas size ▸` picking the active size does nothing at all · `Reset canvas…` keeps `meta.id`
  and its confirm carries the New map signpost (`14` §4.9) · the `Map` menu offers **no** New map
  and **no** Open Map… · `Edit → Delete selected` matches the rail's button, one store action and
  two call sites · **no rail scrollbar at 900 px viewport height** with a generated world loaded.

---

## Batch 6 — Tools that say what they do (WP-24 … WP-27)

**Design:** `../12-tools-that-say-what-they-do.md` — read it in full. **Decision:** ADR-37,
covering WP-26 only.
**Prerequisite:** none. Each package ships alone, and none of them blocks Batch 5.

**Settle first: `12` D4 only** — does the generator's scatter read the same rotation knob (it
changes what a world code reproduces). **`12` D1–D3 are settled**: rivers die to the eraser too,
whole · Erase sits beside Select in the mode group · and *hidden* protects **every** layer, not
only terrain.

> **Decision numbers are per design document**, the way `08`'s are. `12` D4 is not Batch 1's D4.
> Cite the document when you refer to one, or the two collide in the tracker.

**What this batch is about.** Four places where a tool's behaviour and what the UI says about it
have drifted apart: a brush that shows nothing until you commit to a drag; an "Erase" that means
two different things by layer and cannot touch two of the five object types at all; a Select
that exists twice because ADR-28 made it global and nothing swept up behind it; and a scatter
rotation that is a constant pretending to be a decision.

**Build order is numeric, and that is not appeal order.** WP-25 and WP-26 both edit
`LAYER_TOOLS`; the smaller change lands first so the larger one edits a clean table.

### WP-24 · The brush ring follows the cursor
A ring at the hover point whenever a brush-shaped tool is in hand — terrain brush, sea brush,
scatter, erase — and **none** for place (no radius) or select (I4 already governs its cursor).
Map-space radius of `brushSize / 2`; **screen-constant stroke** per I8, so it neither vanishes
at fit zoom nor thickens into a band up close. Sea brush and eraser rings read as removal,
extending the preview stroke's existing rule.

**This adds a circle, not a mechanism.** `MapStage` already tracks the hover point on every
`onMouseMove` and clears it on `onMouseLeave`, for the x/y HUD readout.

- **Acceptance:** moving the pointer over the stage **without pressing** shows a ring for each
  of the four brush tools and none for the other two · dragging the size slider changes the
  drawn radius while the pointer is still · the on-screen stroke width is the same at fit zoom
  and at 400 % · the ring clears on `mouseleave` and does not survive a switch to place.

### WP-25 · One Select, everywhere
`LAYER_TOOLS` loses `"select"` and **nothing else** — `"erase"` stays until WP-26, because the
rail's chip is currently the only object eraser there is and removing it first would ship a
build with none. `RIVER_TOOL_LABEL`'s `select → "Edit"` goes with it;
reshaping a river happens through global Select, which ADR-29 specifies and WP-20 built.
Smaller than it looks: `setActiveLayer` already treats select as living outside the table.

**Rides along: the selected coastline gets honest contrast.** `BIOME_FILL` is refreshed from CSS
tokens whenever the theme flips; the outline is a hardcoded `#22685B`. The background moves and
the outline does not. Two-tone stroke — wider contrasting halo under a narrower accent core,
both screen-constant — so no single colour has to work on grassland *and* snow *and* dark-mode
desert. It rides here because it is the same complaint, and touching one selection file twice in
a batch is worse than once.

- **Acceptance:** no Select chip in the rail on any layer, and the toolbar's Select still selects
  across layers and survives a layer switch · on rivers the rail offers **Draw** only, and a
  river's points are still draggable under global Select — driven, since that is the interaction
  the removed chip used to reach · a selected landmass is legible on grassland, snow and desert
  in **both** themes, with the theme toggle part of the check.

### WP-26 · Erase is its own tool; the sea brush is terrain geometry
**Amends ADR-18 and reverses ADR-28's relabel-rather-than-split.** Sea brush unchanged —
terrain-only, subtracts geometry, still cuts a landmass in two. **Erase becomes a global object
eraser**, peer of Select: a drag removes every object the disc overlaps on every visible,
unlocked layer, and **a landmass it touches dies whole**. Lock and visibility are the scoping
mechanism, exactly as ADR-28 made them for Select. **`LAYER_TOOLS` loses `"erase"` in this
commit**, finishing WP-25 — once the tool is global the rail chip is the duplication Select's
was, and this is the first moment removing it costs nothing.

**This closes a real gap, not just a naming one.** `isUnderBrush` returns false for anything
without a footprint, so **landmasses and rivers have never been erasable by any tool at any
time**. `isUnderBrush` grows two path branches, both with their machinery already present:
`landmassAt` for inside-the-coast, `river.ts`'s `distanceToSegment` (export the private helper
rather than copying it) for near-the-coast, and `isOnRiver` already takes the slack argument it
needs. `eraseAt` walks every live layer instead of `activeLayerId` and files one step across all
of them — `deleteSelection`'s shape.

**Whole landmasses, deliberately.** Partial removal *is* the sea brush; two tools that both
nibble a coastline are one tool wearing two hats. Undo covers it — one drag is already one step.

- **Acceptance:** a driven drag crossing a landmass deletes **the whole landmass**, and one undo
  brings it back · the same drag leaves a **locked** terrain layer untouched, and a hidden one
  too (per D3) · one drag across mountains, a river and a landmass removes all three as **one**
  undo step · the sea brush still subtracts a disc and still cuts a landmass in two — unchanged,
  checked because this is where it would break · **a mutation proving the lock check
  discriminates**: remove the lock test and the locked-layer check must fail.

### WP-27 · Scatter rotation is a knob, not a constant
`anchorAt` hardcodes `rotation: scatter ? jitter(5) : 0`. Replace the `5` with session state
`scatterRotation` in degrees, surfaced as a slider beside brush size, **defaulting to 0** so
every sprite is upright until asked otherwise. This deliberately changes the current feel. The
value is jitter **spread**, not an angle: 0 upright, 15 means ±15°, capped where it still reads
as cartography rather than confetti.

**D4 is not the implementer's call.** Either the generator's scatter reads the same knob — and a
generated world's rotation follows the setting, so the world code grows a field — or it keeps its
own constant and the comment claiming it is the "same jittered look the scatter brush gives by
hand" gets rewritten. It changes what a world code reproduces.

- **Acceptance:** at 0, every scattered object has `rotation === 0` — read the **scene**, not the
  render · at 30, rotations fall within ±30 and are not all equal · the slider appears only for
  the scatter tool · whatever D4 decides, `scatter.ts`'s comment matches the code afterwards.

---

## Batch 7 — Reading the map (WP-28, WP-29)

**Design:** `../13-reading-the-map.md` — read it in full. **Decisions:** ADR-38, ADR-39.
**Prerequisite:** none. Both ship alone; neither blocks Batch 5 or Batch 6.

**Settle first: `13` D5 only** — does the mountain shrink change the sprite constant, and so every
saved map, or only new placements. **`13` D6–D10 are settled**: the end being laid snaps, whichever it
is · an end that snaps to nothing gets a **round cap** · a dragged endpoint re-snaps (modifier
suppresses it), a moved coastline re-snaps nothing · nearest wins · no self-snap.

**What this batch is about.** Three complaints about the finished picture rather than the tools
that make it: mountains are too big for the land they stand on, you cannot pull back far enough
to see the canvas as a whole, and a river stops dead at the shore. The first two are constants
judged by looking; the third is a real feature and carries all the risk in the batch.

### WP-28 · The map at a glance
Two constants, together because they are the same complaint — *things are the wrong size on
screen* — and because both are judged by looking rather than by asserting.

**Mountains at three-quarters:** `SPRITE_HEIGHT.mountain` 190 → **142**, against 84 for a tree
and 165 for a landmark. **`13` D5 first**: the constant is the base height for the *kind*, so changing
it re-renders every mountain on every saved map. Recommended anyway — "mountains are too big" is
a statement about the art, a per-placement scale would leave one map holding two mountain sizes
with nothing in the UI to explain it, and nothing is deployed. Costs nothing downstream: WP-21's
ink figures are ratios and stay valid, and `spriteBounds` reads the same constant so boxes,
picking and the rbush index follow without being touched.

**Zoom out past the canvas edge** (ADR-38): `fitScale` stops doubling as the minimum zoom; the
floor becomes `fitScale × MIN_FIT_FRACTION` with the fraction at **0.5**. That is the whole
change — `clampPan` already centres a map smaller than the view (a branch that existed for narrow
viewports), and `padRect` already clips cache rects to the map, so ADR-19's budget is untouched.

- **Acceptance:** peaks measure three-quarters of their previous height against the same
  coastline — **two screenshots at the same zoom**, since the assertion is visual · clicking a
  mountain still selects it and the marquee still catches it, one driven picking check at the new
  size · zooming out past fit shows the whole canvas centred with background around it, stopping
  at half of fit · panning below fit does not move the map · zoom in still stops at `MAX_SCALE`
  and `zoomAt` still pins the point under the cursor at both ends.

### WP-29 · Rivers meet the sea, and each other
An endpoint within a **screen-space** threshold of a coastline **or another river** snaps to the
nearest point on it, and the mouth is pushed past the coast stroke and the first ring band, so
the ribbon crosses the shoreline instead of stopping on it. Landing that click by hand is
impossible at fit zoom — a 4000 px canvas is a few hundred screen pixels — and rivers draw above
terrain, so a stub of land or a blunt cap in open water is visible either way.

**The mouth is reshaped, not just moved — and the reshape is control points.** Moving the
endpoint onto the coast still leaves a cap cut across the flow, which is the actual thing that
looks wrong. But `riverCentreline` is `chaikin(points, 2, false)`, which **pins the last points
the user placed**, and the cap's direction is the tangent of the last two centreline points. So
writing the final points **along the local coast normal** — a short approach point inland, the
mouth point overshooting seaward — rotates the cap onto the coast tangent and the mouth opens
along the shore. No stored outline, no polygon boolean, **no `schemaVersion` bump**, and the
baked tail is two ordinary points the user can drag afterwards.

**Record the ceiling as a `ponytail:` comment.** A straight cap matches the coast *tangent*, not
its *arc*, so a sharply curved bay gets a chord. The upgrade is clipping the ribbon against the
land polygon, which needs either persisted geometry (a `schemaVersion` bump for something
derived) or a live terrain dependency at draw time (rejected — see D8, and DEBT Q-01 on cache
cost). Ship the straight cap and name the way out.

**The river-to-river half needs the snap and no reshape at all.** WP-8 already decided it, on
`canvas/draw.ts`: a river is *"flat, opaque and unstroked, so two overlapping ribbons paint the
same colour twice and a confluence is seamless."* There is no bank stroke to interrupt, so a
tributary whose endpoint lands **inside** the trunk joins it with nothing to hide — overshoot
past the trunk's centreline by half its local width so the cap is buried rather than poking
through the far bank. **It is not a join.** Two rivers that meet are two objects that overlap;
neither references the other, and deleting the trunk leaves the tributary ending in open water.

**Screen-space, and the preview changes first.** The threshold converts at the current scale so
the snap feels the same at fit zoom and at 400 % (I8's rule). A tip that *will* snap draws
differently from one that will not, **before** the click — I4, because a snap revealed only
afterwards is a cursor that lied.

**The snap does not persist** (D8). It resolves at draw time and stores plain points; a river
never references the landmass it met, so a landmass that later moves leaves its river behind the
way it leaves the mountains that stood on it. Adding a live constraint would mean one object's
geometry depending on another's, which the scene model does not do.

Reuses `distanceToSegment`, the module-private helper in `river.ts` that **WP-26 exports anyway**
— whichever lands first pays for it. The overshoot distance is a **named constant, not a
derivation**: it must sit right against a screen-constant coast stroke *and* a ring gap the user
sets anywhere from 4 to 60, so it ships as the number that looked right and says so.

- **Acceptance:** a last click **near** a coast ends **on** it, and the assertion reads the
  stored points rather than the picture · the same click far from any coast does not snap, and
  the tip preview differs between the two cases **before** the click — driven, sweeping the
  pointer, because the preview is half the promise (`07` §1) · the threshold in map units at
  400 % is a quarter of what it is at 100 %, which a fixed map-unit threshold would fail · the
  mouth crosses the coast stroke and the first band at ring gaps **4 and 60**, both ends of the
  slider · **a river meeting a coast at 45° ends with its cap parallel to the coast tangent, not
  perpendicular to its own last segment** — read the stored points, the last two lie on the
  normal · a tributary finished near another river ends **inside** it and the two read as one
  shape with no seam · deleting the trunk leaves the tributary unmoved, ending in open water · a
  snapped river survives save and reload with the same points, since nothing new enters the
  scene contract — **no `schemaVersion` bump in this package**, and if one appears the design has
  gone wrong.

---

## Batch 8 — Routes, a front door, and a page to start from (WP-30, WP-31)

**Design:** `../14-routing-and-landing.md` — read it in full. **Decision:** ADR-40.
**Prerequisite:** WP-22 (the gallery this batch turns into a page) and **WP-23** (the generate form
the create page mounts).

**Settle first:** nothing. `14` §6 records **D1–D12, all settled.**

> **Decision numbers are per design document.** `14` D1 is not Batch 1's D1 or `12`'s D1. Cite the
> document.

**What this batch is about.** The editor has no routes at all. `App.tsx` is the whole application,
one URL is the whole address space, and the only way to reach a second map is a dialog over the
editor. A map cannot be linked, bookmarked or opened in a second tab, and which map is open is
kept in a **localStorage id** ([useAutosave.ts:70-73](../../src/persistence/useAutosave.ts#L70-L73))
— the app *remembering* what an address could simply *say*.

**The rule, and it is ADR-36's one level out:** that document sorted controls by **kind** (a menu
holds commands, a rail holds live state). This one sorts them by **scope** — *the menu bar owns
this map; the gallery owns which map.*

**None of this needs a host.** The deploy is WP-13's separate unfinished half and needs a domain;
every package here is built and driven at `localhost`. That is not incidental: **every CDP driver
in the repo runs against the dev server** (`07` §1), so the dev-server routing is this batch's
deliverable and not its polish.

### WP-30 · The routes
`/maps` (the gallery as a page, **Your maps**), `/maps/create` (a setup page),
`/maps/edit/{uuid}` (the editor), a static 404 for an unknown path and an in-app redirect for an
unknown uuid. **Hand-rolled router, ~30 lines**, plus a `<Link>` helper — no new dependency, the
same call the repo made for IndexedDB and for driving a browser. It also owns the three things the
primitive does not give you: per-route `document.title`, scroll restoration on Back to `/maps`, and
focus management.

**The dialog is replaced, not duplicated.** ADR-35 already makes switching maps clear the undo
stack, so it is a navigation in everything but presentation. `/maps` gains an **empty state** it
never needed as a modal, and `replaceState`s to `/maps/create` when the list is empty *and known* —
at P2, "known" means both local and cloud answered, or a signed-in user with five cloud maps gets
told to create their first one.

**`/maps/create` is a page, not a redirect**, because `resetCanvas(preset)` doubles as *change
canvas size* and discards every object — canvas size is free exactly once, at creation, and there
was no screen there to offer it. Defaults to **landscape**. Generation runs **in the editor after
the navigation**, reusing the existing path and its "Generated N landmasses" toast. Nothing reaches
IndexedDB until the user clicks through.

**This package deletes more than it adds where it can.** `rememberOpen` / `rememberedOpen` and the
`loadLatestScene()` fallback go — the route parameter is already the IDB keyPath (WP-22). The
editor route does **nothing at all** when `store.scene.meta.id` already matches, which is what
makes Back preserve the undo stack, since `useEditorStore` is a module singleton that survives an
unmount.

**Four traps, each one line with a delayed symptom** (`14` §4.7). The create page must
**`replaceState` on completion** — `pushState` leaves a finished setup step behind Back, and
completing it a second time mints a **second map**. `pushState` on the empty-`/maps` redirect
**traps Back in a loop**. `location.assign` anywhere is a full reload — the blink, and the bundle
paid for twice. And **client-side navigation must flush autosave**: the throttle is 800 ms and
flushes on `pagehide`, which a route change does not fire.

**Two tabs on one map** get a `BroadcastChannel` warning. The local save path has never had a
version check — ADR-33's is cloud-only — and linkable URLs make the collision easy. Warn rather
than block: a two-monitor workflow is legitimate, and silent data loss is the one thing that does
not get simplified away.

**Dev and production hold the same routing rule twice.** Vite's default `appType: "spa"` would
serve the *landing page* at `/maps/create`; `"mpa"` 404s it. What is needed is `"mpa"` plus a
~10-line `configureServer` middleware, mirrored in the nginx site. *Works locally, 404s in
production* has exactly one signal, and it is a deploy.

- **Acceptance:** every route renders its own screen and **Back/Forward move between them** ·
  backing out of `/maps/create` **without choosing** returns the previous map **with its undo
  stack**, while **completing** it returns that same map with an **empty** one (a different
  `meta.id` is in the store, so ADR-35 clears history) — the pair pulls opposite ways, which is
  what makes it discriminating · **a mutation proving the flush discriminates** — remove it, and a check that
  edits, navigates within 800 ms and reads the **record** must fail (`07` §1) · `/maps/create`
  writes **no draft** until the user clicks through, and exactly one after — read the record, not
  the UI (WP-22's lesson) · empty `/maps` redirects, and Back from there reaches the landing page
  rather than bouncing · right-click → *Open in new tab* works and leaves the first tab unchanged ·
  two tabs on the same uuid warn, two tabs on different maps do not · an unknown uuid redirects and
  **creates no record with that id** · a reload at `/maps/edit/{uuid}` restores that map with
  `rememberOpen` deleted — **age another draft so "newest" and "this one" differ**, or the check
  cannot fail · `vite preview` routes identically to `npm run dev` · driven input throughout.

### WP-31 · The landing page
A static HTML file at `/`, styled with the Tailwind build and `tokens.css` the app already uses, so
the page cannot drift from the application and a visitor reaches `/maps` with the stylesheet
cached. **No React, no router, no editor bundle.** Hero is a **WebP exported from the editor
itself**; one primary CTA → `/maps`; six sections, one sentence and one exported image each, and
**only shipped exports advertised**. `/how-it-works` is **reserved, shell only**.

**No `/login` or `/signup` pages.** ADR-06's PKCE redirects to Zitadel's hosted login, so there is
no form to build — P2 needs a Sign in *button*, a signup hint parameter (**verified against a live
Zitadel at P2 WP-1**, not assumed), and `/auth/callback` landing on `/maps`. A static page cannot
know it is signed in, because `platform/README.md` D2 keeps no refresh token in the browser: the
header reads a **localStorage hint**, which is a label and **never** an authorization decision.
Ship the slot now, the buttons at P2, and keep it quiet — ADR-07's "no login wall" is a promise
about how the product feels.

- **Acceptance:** the headline and every section heading appear **in the HTML body** before any
  JavaScript runs — assert on the response text · the page loads **no editor bundle**, asserted on
  the network requests rather than on feel · the CTA reaches `/maps` and the theme matches the
  app's in both light and dark, since both read the same tokens · `/how-it-works` and the 404 both
  render and both link home.

---

## Batch 14 — Water as objects (WP-40 … WP-43) — **EXPERIMENTAL**

**Design:** `../16-water-as-objects.md` — read it in full, **including §10**. **Decisions:**
ADR-47 (subtraction), ADR-48 (one object kind), ADR-49 (land carves water).
**Prerequisite:** none. **Deadline:** see `16` §8 — **this batch must land before the app has
users other than its author**, which is nearer than it sounds: staging is already live (WP-39).

> **This batch is not approved in shape, and that is deliberate.** Every other entry in this file
> describes work whose design was settled before building. This one describes work that is
> **settled enough to try**. Three of its decisions — `16` D12 (a heavy outline on a narrow river),
> D7 and D15 (artistic random width), and C2 (whether a two-collection derivation is fast enough)
> — cannot be judged by a fixture, an assertion, or a screenshot. They are judged by drawing maps.
>
> **So the batch ends in an evaluation session, not in a tick.** When all four packages pass, the
> owner uses the editor and decides: accept with tweaks, or revamp completely. Until that decision
> is written into `16` §10, **nothing may be built on top of this**, and node editing (`16` D3) in
> particular must not be scheduled — it is the batch that would be most expensive to throw away.
> Record shortcuts as `ponytail:` comments rather than fixing them; a fix to something that may be
> deleted is worse than a note.

**Settle first:** nothing. `16` §9 records **D1–D18, all settled**, in the ideation session of
2026-08-12. Two of them (D8, D13) dissolved rather than resolved; the table says which and why.

> **Decision numbers are per design document.** `16` D1 is not Batch 1's D1, `12`'s D1 or `14`'s
> D1. Cite the document.

**What this batch is about.** A river is an independent filled ribbon that knows nothing about any
other river (ADR-14), and `15-river-engine.md` wrote down where that leads: a coast stroke painted
across a river mouth, a tributary fatter than the trunk it joins, a mouth faked with control
points because the model has no mouth in it. `15` proposed a drainage graph and then declined to
build one, because three of the five decisions it needed depended on features deferred to a later
version.

**This is the other way round the problem.** Water becomes a *substance* with its own geometry —
the "first-class water bodies" v1 deferred and this batch brings forward — and the land is drawn as
`union(land) − union(water)`. Both `15` defects stop being representable rather than being
patched. What it does not deliver is the topology: no graph, no derived width, no deltas, and `15`
**H2 is closed permanently** by D7. The picture of a network without the network.

**The rule the whole batch applies, and the owner stated it three times:** *no special cases.* One
object kind, two ways to author it, identical behaviour afterwards. A water body and a landmass
differ by two fields:

```jsonc
"landmass": { "id", "type": "landmass", "path", "holes", "biome", "name" }
"water":    { "id", "type": "water",    "path", "holes" }
```

No `width`, `taper`, `points`, `seed` or `roughness` on the object. Those shape the geometry at
creation and are then gone, the way brush size is gone. **If you find yourself adding a field to
distinguish a spline-drawn river from a painted one, the design has gone wrong** — that split was
proposed in the ideation session and rejected on exactly this ground.

**Build order is numeric, and it is prototype-first.** WP-40 has no interaction in it and carries
every geometric risk in the batch. **If its measurement is bad, the rest does not start.**

### WP-40 · Water is a substance  *(no tools — fixtures and rendering only)*
The `water` type, the `schemaVersion` bump with its `migrate()` step, the two-collection
derivation, the band rule, the layer rename, the visibility toggle. `16` §5.

**`02-scene-data-model.md` changes in this commit, and it is law.** §4's `river` entry — `points`,
`width`, `taper` — is replaced by the `water` type, §3's layer table takes the rename, and §6's
`migrate()` contract gains its step. The hard constraints at the top of this file say the scene
JSON matches that document *exactly*; a bump that lands without editing it leaves the contract
describing a shape the code no longer writes.

**`migrate()` deletes every existing river** (D14). A deletion, not a conversion — the only saved
maps are local drafts and the only person holding any is the owner. **Free only until the app has
users other than its author**, which is nearer than the checklist implies: WP-39 already ships
every merge to `main` to a staging host. See `16` §8, which also records two documentation gaps
found there.

**Bands need no provenance tracking, and must not attempt any.** Offset from the cut boundary,
then intersect `canvas − union(land)` — the *pre-cut* sea. Neither `polygon-clipping` nor
`clipper-lib` can say which output edge came from which input, and re-associating vertices by
proximity is fragile in the way that shows up on one map in fifty.

The layer becomes **Water**, because carve makes lakes and lay makes rivers and both are the same
substance. Keep every `data-*` hook on whichever element it moves to.

**This package deletes river point-dragging and `width`, so three documents go stale in the same
commit and must be corrected in it.** Each is *correct today* and describes a field that stops
existing:

- **`07-interaction-invariants.md` I5's top rung** — *"a river's control points outrank the frame's
  handles"* — along with `RiverOverlay`'s use of `selection.riverPoints`. An invariant naming a
  deleted field is worse than none, because the next reader will try to preserve it.
- **`09-selection-across-layers.md`** — §WP-20's *"scale multiplies `width`"*, its acceptance
  criterion *"scaling 2× doubles the drawn width"*, the frame-height evidence built on it, **and
  decision row E10**, which answers a question about a field that will not exist. With no `width`,
  water scales like a landmass and the whole branch collapses. Amend in place, the way `08` T1
  carries its *"Revised as built"* correction; do not delete the history.
- **ADR-29** — the same sentence, in the decision log. `16` §7 already says the branch simplifies;
  ADR-29 should say so where someone reading the log will see it.
- **`01-system-design.md` §7** — *"Rivers: a separate spline tool — tapering polyline (wider
  toward the sea)"*. That is the system description of what a river **is**, and after this package
  it is neither a polyline nor tapering. §15's deferred list is already updated; this line was
  missed with it. **The gap is accepted, not overlooked** (`16` §7): what is lost is precision, WP-41
and WP-42 give back freehand reshaping by brush, and both substances then edit the same way.

- **Acceptance:** a seeded landmass plus water polygon renders a channel with stroked banks and
  **no bar across the estuary** · **no band inside a channel, at `ringGap` 4 and 60** · water
  entirely over open sea renders nothing · hiding the water layer closes every channel · a
  pre-bump draft loads with zero river objects and no error · **measured: the new derivation cost
  against the 119–488 ms baseline, with its object count** — C2 is an assumption until that number
  exists.
- **Fixtures:** `16` §5 (WP-40) — five, headlined by *a river crossing a coast produces one merged
  boundary, not two crossing ones.*

### WP-41 · The water brush, and water joins the selection
One brush, two modes — **carve land** (today's sea brush, unchanged) and **lay water**. The commit
path is the landmass brush's, against the water collection; strokes merge on overlap (D10) and
ADR-10's identity rule applies.

**The mode must be legible before the press** (I4). WP-24 already draws the hover ring and already
gives removal its own reading — this is a third variant, not a mechanism. It is also why D6
matters: the two modes produce visibly different results, so the mode is legible in the map and
not only in the rail.

**Selection is nearly free.** `landmassAt` generalises; water joins the pool land already uses,
takes the same coastline highlight, and dies whole to WP-26's eraser. Precedence is **water first,
landmass as fallback** — WP-19's footprint-first rule in a new coat.

**Ship selection in this package, not later.** A tool that creates objects the user cannot select
or delete is not a shippable package.

- **Acceptance:** a driven drag paints a channel and the coastline wraps it · two overlapping
  strokes make **one** object · one drag is one undo step · clicking a channel selects the water,
  not the land under it · **exactly one derivation per stroke, not per frame** · the hover ring
  distinguishes carve from lay **before** the press, read by sweeping the pointer (`07` §1) · a
  locked or hidden water layer contributes nothing to a click.

### WP-42 · Land carves water
The terrain brush subtracts its stroke from every water object it crosses, **destructively**, then
runs connected-components — so painting land across a river severs it in two. The only way to
remove *part* of a water body, since merging is eager and the eraser kills objects whole.

**The asymmetry is required, not an oversight** (`16` C8): water subtracts from land
non-destructively, land carves water destructively. Symmetric subtraction would have the two
substances defining each other in a circle. Do not "fix" it without re-reading C8.

**Its own package because two destructive edits meet here.** One stroke can grow land and shrink
water in the same commit, and both halves must land in **one** undo step.

- **Acceptance:** a driven terrain drag across a channel severs it, and the scene holds two water
  objects where it held one · **one** undo restores the single object *and* the land, in one step ·
  a stroke that merely narrows a river leaves one object · a stroke covering a small water body
  deletes it and says so.

### WP-43 · The spline generator
Drag a path, get a water polygon with randomised width and roughness. On commit it merges like any
other water and is thereafter **indistinguishable from a painted one** (C9).

**The preview shows the water, not a line.** A tool that shows nothing until it commits is the
complaint `12` opens with and WP-24 was built to answer. The surprise belongs in the *detail*, on
commit — never in the *object*. The preview must also honour D16: over open sea the tool produces
nothing, so it must preview nothing there.

**Width is an artistic random walk, not a taper** (D7) — a river may be wide in the middle, and
nothing accumulates downstream ever. **Variation is proportional to base width** (D15): a 40-unit
river wanders 28–52, a 6-unit river 4–8. There is no floor, and proportional variation is what
makes a floor unnecessary.

Width and roughness live in the rail beside brush size. **They are not written to the object, and
there is no Reroll** (D17) — undo and draw again.

- **Acceptance:** the preview during the drag is the ribbon at the set width, not a line · the
  committed object has **no** `width`, `seed` or `points` field — read the **scene**, not the
  render · two rivers drawn across each other make one object · a river drawn entirely over sea
  commits nothing and previewed nothing · the width setting changes the preview while the pointer
  is still · the same path drawn twice gives different banks — **assert the difference, not a
  value; irreproducibility is the design.**

## Batch 15 — Vertex editing (WP-44 …) — **SCHEDULED, shape unsettled**

**Design:** `../17-vertex-editing.md` — a *note*, not yet a work order, and it says so. **Read §5
and §6 before anything else.** **Prerequisite:** Batch 14, **met** — accepted 2026-08-14 (`16`
§10). **Deadline:** none.

> **This entry exists to schedule the batch, not to brief it.** Every other entry in this file
> can be handed to an agent; this one cannot, because **V2 is open** — exact node handles, a coast
> sculpt brush, or both — and the two shapes do not share a package breakdown. Writing package
> numbers before V2 would be picking the answer by implication, which is exactly what `17` §7
> refused to do while V1 was open.

**Settle first:** **V2 … V11** (`17` §6). V1 is answered — the batch arrives; the freehand brushes
Batch 14 shipped did not turn out to be sufficient, which is the observation `17` §7 was waiting
for rather than an argument it won.

**V2 is the one that decides the rest.** `17` §5 puts two shapes on the table:

- **A — vertex handles with proportional falloff.** What was literally asked for: select an
  object, see its points, drag one, neighbours follow. Exact. Carries problems **P1–P5** in full.
- **B — a coast sculpt brush.** No handles: a radius, a direction, a falloff, pushing the boundary
  under the cursor. **Disposes of six of the eleven problems** — they turn out to be *handle*
  problems rather than *editing* problems — and composes with the brush-first design of every
  other tool. **It cannot be exact**, and exactness is precisely what Batch 14 took away.

`17` §5's hypothesis is that **B is the larger half of the value at a fraction of the cost**, and
it is written to be falsified. The counter-argument is in the same section and is not weak: if
what was missed is exactness, B does not answer the complaint at all.

**What is *not* in doubt**, whichever shape wins:

- **Both substances.** `16` D3 says outline vertices, land and water alike, and a water object is
  a landmass's shape (ADR-48). The landmass half was never blocked by Batch 14; the water half is
  trivially unblocked by it. A batch that did rivers only would be building the special case this
  repo's water design exists to avoid.
- **`07` I5 gains a rung back.** WP-40 removed the top one when it deleted river control points,
  and I5 records that node editing is the invariant that re-opens it — a vertex on a coastline
  will sit on a frame corner exactly as an endpoint did.
- **The dangerous problem is P-self-intersection**, `17` §4: an edit that crosses a coastline over
  itself corrupts the *terrain derivation*, not merely the picture. **V3 and V10 answer it
  together**, and both must be settled before the first package rather than after.

**When V2 is settled**, `17` becomes a work order — per-package acceptance criteria and fixtures,
an ADR for each load-bearing call — and the packages take WP-44 onward.

---

## Adding a future batch

> **Batches 9 and later are tracked in `05-p0-build-checklist.md` only.** This file carries a
> full work order for a batch that is *about to be built*; once a batch has shipped, its entry in
> the checklist is the record — which is why Batches 9–13 (WP-33 … WP-38) appear there and not
> here. The checklist is the backlog and the history; this file is the brief.

Append it below Batch 1. A batch is admissible here when it (a) changes the **core editor**,
(b) is larger than a bug fix, and (c) does not belong to P1–P3. It needs:

1. **A design document** in `architecture/v1/` — numbered next in the series (`09-…`), stating
   the constraints it must satisfy, the decisions it needs from the human, and per-package
   acceptance criteria and fixtures. `08-terrain-as-objects.md` is the template.
2. **An ADR** in `03-architecture-decisions.md` for each load-bearing decision, including the
   rejected alternatives.
3. **Packages numbered from the next free WP**, listed in `05-p0-build-checklist.md` under
   the follow-up section.
4. **A row in the phase overview** in `../README.md` only if the batch is large enough to
   read as its own body of work.

A batch that needs a scene-shape change is not forbidden — but it ships the
`schemaVersion` bump and the `migrate()` step in the same commit as the shape change, and it
says so in its design document.

## Out of scope for this file

Anything a later phase owns: distribution and embeds (P1), accounts, backend, cloud
persistence and hosted sharing (P2), the extracted npm packages (P3). Also the items already
deferred from v1 — a second map style, formal object grouping,
auto-generated rivers, blended biome transitions, tile-render export, a WebGL renderer.
Those return through a v2 design pass, not through this backlog.

> **One item left this list rather than returning through a v2 pass: first-class water bodies,
> now Batch 14.** That is a deliberate exception and not a precedent. It qualified because the
> deferral had started to cost something *in the core editor* — rivers-as-ribbons was producing
> visible defects (DEBT **V-02**) that no local patch could reach — and because `16`'s design
> needs none of the three unknowns that put it on the list. **A deferred item is admissible here
> only on that test:** it is already hurting the editor, and it can be built without settling the
> things it was deferred for. Wanting it is not enough.
