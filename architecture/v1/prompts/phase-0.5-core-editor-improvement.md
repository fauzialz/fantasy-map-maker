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

## Batch 2 — Selection across layers (WP-18, WP-19)

**Design:** `../09-selection-across-layers.md` — read it in full. **Decision:** ADR-28.
**Prerequisite:** WP-13 for WP-18 (it regroups the toolbar WP-13 built); **WP-17 and WP-18**
for WP-19.

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

### WP-19 · Terrain joins the selection
One frame over land and sprites, which is only honest once WP-16 makes every handle move
geometry. WP-14's coastline highlight stays, **additive** to the frame. Hit precedence is
footprint first, landmass as fallback; the marquee is asymmetric on purpose — intersection for
sprites, containment for land; a double-click on a landmass selects it and its contents.

**The risk sits in one item:** overlap resolution runs first and its **resolved delta** goes to
every object in the drag, or the mountains end up off the land they were standing on.

- **Acceptance:** a landmass and its mountains move together and stay registered when "keep
  apart" slides the drop back · clicking a mountain on a coast selects the mountain · a marquee
  clipping a continent's corner takes its trees and not the continent · double-click selects
  land plus contents · one ring derivation per drop · the biome palette appears for a mixed
  selection and recolours only the land · driven input.

---

## Adding a future batch

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
deferred from v1 — a second map style, formal object grouping, first-class water bodies,
auto-generated rivers, blended biome transitions, tile-render export, a WebGL renderer.
Those return through a v2 design pass, not through this backlog.
