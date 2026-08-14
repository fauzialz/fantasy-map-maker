# Water as Objects — One Substance, Two Brushes, No Special Cases

_Status: **ACCEPTED · built as WP-40 → WP-43.** Shape agreed in the ideation session of
**2026-08-12**; every decision in §9 settled; built, used, and **accepted by the owner on
2026-08-14** — see §10, which records the outcome and the tweaks that preceded it. This was the
first design in the repo deliberately **not** approved in shape: argued to a settled shape and
then *tried*. It survived contact, with three of its own decisions amended by use. **Downstream
work may now assume the water model exists.**_

_This document **supersedes most of `15-river-engine.md`**, which stays for its analysis. It is
the **design**; the **work order** is `prompts/phase-0.5-core-editor-improvement.md` (Batch 14).
Load-bearing calls are **ADR-47** (subtraction), **ADR-48** (one object kind) and **ADR-49** (land
carves water)._

## 1. The concept

> Rivers on top of landmasses should act like landmasses on top of the sea. A landmass is drawn
> by brush strokes, merges when strokes overlap, and is cut by the sea brush — rivers should act
> the same. Two ways to make one: a **river brush** that works like the sea brush but adds water
> instead of removing land, and the **spline tool**, which shows only a line while you draw and
> then renders a river along it with randomised width and roughness. Selecting a river should
> behave exactly as selecting land does, plus you can see and drag its nodes — and I want that on
> landmass select too.

The last clause is the whole design. Landmasses are brush-painted and have no centre path, ever.
So the nodes cannot be spline control points; they are **outline vertices**. Which means there is
no such thing as a spline river and a brush river — there is one kind of object, authored two
ways, and the spline is a **generator** whose inputs are consumed and discarded, exactly as the
world generator's seed produces geometry that becomes the truth (`02` §1).

**The principle, stated three times in the request above: no special cases.**

## 2. What this actually is

This is **first-class water bodies** — deferred to a later version in `README.md` §Status, and the
feature `15` §6 **N4** identified as having nowhere to attach. It is not a river-tool refinement.

It resolves both defects `15` recorded, and neither by patching:

| `15` defect | Resolution |
|---|---|
| §1.1 — the coast stroke crosses the river mouth | There is no mouth to cross. The estuary *is* coastline, so the stroke wraps it. M1's dilation hack is not needed. |
| §1.2 — a tributary wider than its trunk | A union has no trunk and no tributary. The state stops being representable. |

It does **not** deliver `15`'s network model. There is no drainage graph, no derived width, no
modelled confluence, and **H2 is closed permanently** by D7 — width is an artistic choice, not a
hydrological one. What you get is the *picture* of a network without the *topology*. That is the
trade, taken deliberately: three of `15`'s five blocking decisions depended on features deferred
to a later version, and this design routes around all three rather than waiting for them.

## 3. The model

Two substances. Identical shape.

```jsonc
"landmass": { "id", "type": "landmass", "path": [[x,y],…], "holes": [[…]], "biome", "name" }
"water":    { "id", "type": "water",    "path": [[x,y],…], "holes": [[…]] }
```

A water object carries **no** `width`, `taper`, `points`, `seed` or `roughness`. Those are tool
settings that shape the geometry at creation and are then gone, the way brush size is gone.

**The land is drawn as `union(landmass.path) − union(water.path)`, computed at draw time and
never stored.** The landmass objects on disk are untouched. This is the stencil, not the cut: lift
the stencil — delete the water object — and the land is whole again with no repair. It is the same
contract coastal rings already run under (`02` §7, "derived, never stored"), with a second
ingredient.

**The water layer therefore draws nothing of its own.** It is a *geometry* layer, not a paint
layer — the first in this app. Its only visual contribution is the shape it removes from terrain,
which is why D9's visibility toggle costs a derivation where every other layer's is free, and why
a water object over open sea is invisible (D16) rather than wrong.

## 4. Constraints

Each is load-bearing. A design that violates one produces a defect that type-checks and looks
fine in a screenshot.

| | Constraint | Source |
|---|---|---|
| **C1** | Water never overlaps water at rest. Every commit runs union + connected-components, exactly as land does. Two overlapping water objects would stroke a bank through each other. | ADR-10, ADR-11, by parity |
| **C2** | Derivation costs **119–488 ms** measured (4000×3000, ringCount 4) and now unions two collections instead of one. A frame is 16 ms. Derivation cannot track a drag. | ADR-13, measured — **and the figure must be re-measured**, §8 |
| **C3** | The coast stroke is `lineWidth 3` and straddles the path it follows, so 1.5 units fall either side. On a 12-unit river that is half the width. | `draw.ts:88-91`, D12 |
| **C4** | Rings apply to ocean and lakes, **not** to channels. At `ringGap` 14 a single band is wider than a typical river. | ADR-13, D5 |
| **C5** | Hit-testing is point-in-polygon for both substances. `landmassAt` already answers this question and generalises. | C4 of `08`, by parity |
| **C6** | The pointer must promise what the press will do — and with a mode-bearing brush, *which mode* it is in. | I4, D4 |
| **C7** | The schema changes, so this batch ships a `schemaVersion` bump **and** its `migrate()` step in the same commit. | `02` §6 |
| **C8** | Subtraction cannot be symmetric. If land subtracted from water while water subtracted from land, the two would define each other in a circle. One direction must be destructive. | new, D18 |
| **C9** | Generated content stays ordinary editable geometry. A spline-authored water body must be indistinguishable, afterwards, from a painted one. | ADR-01 |

### The asymmetry C8 forces, stated plainly

**Water subtracts from land non-destructively; land carves water destructively.** So deleting a
river restores the land, but the only way back from painting land across a river is undo. This is
not an oversight and should not be "fixed" later without re-reading C8 — it is the only
non-circular arrangement, and it puts the non-destructive half on the substance the user adds
most often.

## 5. The packages

Ordered prototype-first: the risky derivation before any tool, per the house rule.

### WP-40 · Water is a substance  *(no tools — fixtures and rendering only)*

**Scope.** The `water` object type; the `schemaVersion` bump and its `migrate()` step; the
two-collection derivation; the band rule; the layer rename; the visibility toggle.

**Design.**
- **`migrate()` deletes every existing river.** Not a conversion — a deletion (D14). Nothing is
  deployed and the only saved maps are local drafts, so this is the cheapest correct answer and it
  removes a legacy render path before one exists. **This is free only until the app has users**;
  see §8.
- Fill and coast stroke derive from `union(land) − union(water)`.
- **Bands derive from that same cut boundary, then intersect `canvas − union(land)`** — the
  *pre-cut* sea (D5). Bands can therefore only land in true ocean or lake, never inside a channel,
  and they stop at the original shoreline where a river cuts inland. Two unions and one
  intersection; **no provenance tracking**, which is the point — neither `polygon-clipping` nor
  `clipper-lib` can tell you which output edge came from which input, and re-associating vertices
  by proximity is the kind of fragile that shows up on one map in fifty.
- Layer `rivers`/`river` becomes **`water`/`water`**, and the layer list reads **Water**. Carve
  makes lakes, lay makes rivers, both are the same substance; `12`'s thesis applied to a layer
  name. The rename rides the bump that is happening anyway.
- **Visibility toggle closes the channels** (D9), because the cut is the layer's only
  contribution. The toggle responds immediately and the coastline re-settles after, faded while it
  works — WP-15's ring-suspension pattern exactly, so the pause reads as deliberate.
- The sea brush carving where water already is removes land that is not there: a no-op on the
  picture. Assert it rather than discover it.

**Acceptance.** A seeded scene with one landmass and one water polygon renders a channel whose
banks carry the coast stroke and whose estuary carries no bar across it · **no band appears inside
a channel, at `ringGap` 4 and 60** · a water polygon entirely over open sea renders nothing at all
· hiding the water layer closes every channel and shows one unbroken coastline · loading a
pre-bump draft yields a scene with zero river objects and no console error · **measured: the new
derivation cost against the 119–488 ms baseline, recorded with its object count** — C2 is an
assumption until this number exists.

**Fixtures.** A river crossing a coast produces one merged boundary, not two crossing ones · a
band set derived with a channel present is identical to one derived without it, inside the channel
· a water polygon fully inside land produces a hole in the drawn land and no band · a water
polygon fully in the sea changes nothing · `migrate()` on a v1 scene with three rivers returns a
v2 scene with none and every other object intact.

### WP-41 · The water brush, and water joins the selection

**Scope.** The brush that makes water; the mode split; selection and delete. **The first package
you can actually use.**

**Design.**
- One brush, two modes — **carve land** (today's sea brush, destructive, unchanged) and **lay
  water** (adds a water object). D4. The mode is read before the stroke and **the hover ring says
  which one you are in** (C6): WP-24 already draws the ring and already gives removal its own
  reading, so this is a third variant, not a mechanism.
- Because D6 makes the modes produce visibly different things — carve leaves banded sea, lay
  leaves an unbanded channel — the mode is legible in the result and not only in the rail. That is
  the answer to the standing worry that a mode is invisible state.
- The commit path is the landmass brush's, against the water collection: stamp, union,
  connected-components, simplify at `coastDetail`. **Strokes merge on overlap** (D10), ADR-10's
  identity rule applies, larger piece keeps the id.
- **Selection is nearly free.** `landmassAt` generalises to "point in this polygon collection";
  water joins the same selection pool land uses, gets the same coastline highlight, and is deleted
  by the same global eraser (WP-26) — **whole**, as any object is. Click precedence is **water
  first, landmass as fallback**, the shape of WP-19's footprint-first rule.
- Derivation suspends during the drag and fires once on release (C2), rings faded — WP-15's
  pattern again, now with two triggers.

**Acceptance.** A driven drag in lay mode paints a channel through a continent and the coastline
wraps it · two overlapping strokes produce **one** water object, not two · one drag is one undo
step and undo removes the whole stroke · clicking a channel selects the water, not the landmass
under it · the eraser removes a water object whole and one undo restores it · **exactly one
derivation per stroke, not per frame** · the hover ring distinguishes carve from lay before the
press, read by sweeping the pointer (`07` §1) · a locked or hidden water layer contributes nothing
to a click.

### WP-42 · Land carves water

**Scope.** The reverse subtraction (D18), and the severing it implies.

**Design.** The terrain brush subtracts its stroke from every water object it crosses,
destructively (C8), then runs connected-components — so painting land across a river **severs it
into two water objects**. The mirror of the sea brush cutting a landmass in two, and the only way
to remove *part* of a water body, since merging is eager and the eraser kills objects whole.

**Why it needs its own package.** It is the one place two destructive edits meet: a stroke can
grow land and shrink water in the same commit, and both halves must land in **one** undo step or a
single drag becomes two.

**Acceptance.** A driven drag of the terrain brush across a channel severs it, and the scene holds
two water objects where it held one · one undo restores the single object and the land it removed,
in one step · a stroke that merely narrows a river leaves one object · a stroke that fully covers a
small water body deletes it, and says so.

### WP-43 · The spline generator

**Scope.** The line tool that emits a water polygon.

**Design.**
- Drag or click a path; **the preview shows the water you will get**, at its nominal width, live.
  **Settled at build time: click.** Shipped as a drag first and rejected by the owner — a river is
  a route across a map, chosen, and a freehand drag makes it a brush stroke instead. Clicks lay
  the course, the pointer rubber-bands the ribbon to where the next one would go, and a
  double-click or Enter finishes it.
  Not a bare line. A tool that shows nothing until it commits is the exact complaint
  `12-tools-that-say-what-they-do.md` opens with and WP-24 was built to answer — the pleasant
  surprise belongs in the *detail*, never in the *object*. The randomisation applies on commit; the
  shape does not.
- **Width is an artistic random walk** along the path, not a taper (D7). A river may be wide in the
  middle. Nothing accumulates downstream, ever.
- ~~**Variation is proportional to the base width**, not absolute (D15).~~ **Replaced at build
  time by an explicit minimum and maximum.** Proportional variation off a nominal width was doing
  two jobs and was legible as neither: the number in the rail was a width the river mostly was
  not, and the range it could reach was implicit. Two bounds say what they mean. D15's *reason*
  survives — a river can never wander to nothing — but the floor is now a value the user chose
  rather than an emergent property of the walk, and **the preview draws the maximum**, so the
  commit can only ever come out narrower than the ground it cleared.
- **Roughness is noise on each bank, sampled independently** (D13's "roughness noise"). Varying
  only the width moves both banks in lockstep about the centreline, so the river pinches and
  swells in perfect symmetry — the defect `engine/terrain/roughen.ts` exists to prevent, one level
  along: *nothing on a hand-drawn map runs parallel to anything.* No width walk can fix it,
  because the mirroring is in the construction rather than in the numbers.
- Width and roughness are **tool settings in the rail**, beside brush size. They are not written to
  the object. **There is no Reroll** (D17): undo and draw again.
- On commit the polygon enters the water collection and merges like any other (D10). From that
  moment it is indistinguishable from a painted one (C9) — same fields, same selection, same
  editing.
- The preview must be honest about D16: over open sea the tool produces nothing. **Shown as a
  pale ghost rather than as nothing at all**, corrected at build time — a preview that vanishes
  while you are still clicking out a course is untrackable, and D16's requirement is that the
  preview not *lie*. A ghost says "this part does nothing", which is true; blankness said "there
  is no tool in your hand", which is not. The **commit** still refuses outright.

**Acceptance.** The preview during the drag is the ribbon, not a line, and its width matches the
setting · the committed object has **no** `width`, `seed` or `points` field — read the scene, not
the render · two rivers drawn across each other produce one water object · a river drawn entirely
over sea commits nothing and previewed nothing · the width setting changes the drawn preview while
the pointer is still · the same path drawn twice gives different banks, and neither is reproducible
— **that is the design**, and the test asserts the difference rather than a value.

## 6. What this does not cover

- **Node editing.** Selecting land or water and dragging its outline vertices is **its own batch**
  (D3), and is written up as a note in **`17-vertex-editing.md`** — unscheduled, with its shape
  depending on this batch's evaluation. It is the half of the original request this batch does
  *not* deliver, and it is deliberate. **`17` §3 corrects a claim earlier drafts of this document
  made:** a coastline is 9–14 points per 1000 map units, so tens to low hundreds rather than
  hundreds, which makes the feature more tractable than the deferral argued and proportional
  falloff a refinement rather than a prerequisite.
- **Generated water.** The generator makes no rivers, as today (D11). The only obligation this
  design accepts is negative: **add no field that only a human hand could supply**, so a generator
  can write water objects later without a rewrite. A water object is a polygon; it already
  satisfies this.
- **A drainage graph.** Closed by D7. If anyone ever wants deltas, braided channels or generated
  rivers with hydrologically correct width, `15` §5 is still the design to read, and this batch
  will not have helped.
- **Lakes-as-holes.** A landmass `hole` remains a lake and keeps its bands. Painted water inland is
  a river and gets none. That is not a wart to clean up later — per D6 it is the difference between
  the two brush modes, and it is what gives them a reason to both exist.

## 7. Consequences worth stating before someone rediscovers them

- **A river system is one object.** Draw a trunk and three tributaries that touch and you have a
  single water object: one id, one delete, one undo identity. Landmasses already behave this way,
  but a watershed merges more eagerly than continents do. WP-42 is the release valve.
- **You can never grab a river's spine.** Re-routing a course means dragging bank vertices two at a
  time, once node editing exists. The frame from WP-20/ADR-29 still moves, rotates and scales the
  whole object, so gross changes are fine; fine re-routing is not, and this is the price of D2.

### This batch removes a shipped capability, and that is accepted

**Rivers have point-dragging today and will not have it afterwards.** WP-20 shipped it, ADR-29
specifies it, `RiverOverlay.tsx` draws the points from `selection.riverPoints`, and it is the
**top rung of I5's precedence stack** — *"a river's control points outrank the frame's handles."*
ADR-48 deletes the `points` field, so WP-40 deletes all of it.

**WP-40 must therefore update `07-interaction-invariants.md`**, not merely avoid breaking it. I5's
top rung will describe an object that no longer exists, and an invariant that references a deleted
field is worse than no invariant — it is one a later reader will try to preserve. Rewriting that
rung is part of WP-40, not a follow-up.

**What is lost is precision, not editing.** Selecting a river still gives a frame that moves,
rotates and scales it, and WP-41 and WP-42 give back *local* reshaping by brush — widen a bend by
laying more water, narrow it by painting land across it. That is exactly how a coastline is edited
today, and landmasses have never had draggable points. So after the full batch, **both substances
are edited the same freehand way**, which is the principle this design exists to apply. What no
object has, until the node-editing batch, is an exact way to move one part of an outline.

**The bare window is inside the batch, not in anyone's hands.** After WP-40 alone a river cannot be
touched at all; WP-41 and WP-42 restore brush editing immediately after, and nothing ships on WP-40
by itself. **Decided: accept the gap.** The alternative — folding a fifth package into this batch —
would put an interaction-invariant change beside a pipeline change, which is the combination `07`
records seven bugs about.
- **Deleting a landmass makes the rivers through it vanish**, not merely look wrong. ADR-39 already
  accepted that a moved landmass leaves its river behind visibly; under subtraction it leaves
  nothing behind at all. D16 accepts this and answers it with preview honesty rather than geometry.
- **ADR-14 and ADR-41 are narrowed, not overturned.** Rivers stay out of the boolean terrain engine
  *for their own geometry* — they have no geometry of their own to compute. What changes is that
  terrain's **drawing** now takes water as an input, which is the dependency direction ADR-41
  discussed and DEBT **Q-01** tracks the cache cost of. WP-40's measurement is what makes that
  acceptable or not.
- **ADR-29's river branch simplifies.** Scale multiplying `width` as well as points was a
  path-object special case; with no `width` field, water scales like a landmass and the branch
  collapses.

## 8. The deadline

**D14's free deletion of every existing river expires the moment the app has users other than its
author.**

That is closer than the documents suggest, and the documents are out of date. `05-p0-build-checklist.md`
and `14-routing-and-landing.md` both still describe the deploy as WP-13's unfinished half, waiting
on a host and a domain. But **WP-39 shipped CI/CD on 2026-08-10, and every merge to `main` now
deploys to a staging host** (`.github/workflows/deploy-staging.yml`). Nothing in `architecture/`
records this — WP-39 is absent from the checklist and the word "staging" appears in no design
document.

So the honest statement is not *"the deploy has not happened."* It is: **the only person with
saved maps is the owner, and that alone is what makes the deletion free.** Drafts live in
IndexedDB, per browser, so the exposure is one profile per person who opens the staging URL and
draws something.

The moment that is anyone else, "delete every river" stops being a one-line migration and becomes
a data-loss incident needing a conversion path, a legacy render branch, and a decision nobody
wants to make under pressure.

**Ship this batch before the app has other users, or re-open D14.** There is no third option.

> **Two documentation gaps were found while writing this, and both are now fixed** in the same
> change: WP-39 had no row in `05-p0-build-checklist.md`, and no document mentioned the staging
> host — WP-13's entry and `README.md` both still called the deploy simply "not done." The
> checklist is meant to be the backlog *and* the history, so a shipped package missing from it is
> exactly the drift that made this section wrong on its first draft. **The deploy is now recorded
> as half done**: staging live and checked on every release, production outstanding.

## 9. Decisions

All settled in the ideation session of 2026-08-12. Numbers are per this document — `16` D1 is not
`08`'s D1 or `12`'s D1. Cite the document.

| | Decision | Status |
|---|---|---|
| **D1** | Does water subtract from land, or draw over it? | **Settled: non-destructive subtraction.** Land objects unchanged on disk; `union(land) − union(water)` at draw time. **ADR-47.** |
| **D2** | What does a spline-drawn river store? | **Settled: a polygon, and nothing else.** The nodes a user drags are **outline vertices**, identical to a landmass's. No centreline is ever stored. **ADR-48.** |
| **D3** | When does node editing land? | **Settled: its own later batch.** Outline vertices with proportional falloff, over land and water alike. Not in this batch. |
| **D4** | One water brush or two? | **Settled: one brush, two modes** — carve land, lay water. |
| **D5** | Where do bands come from once water cuts land? | **Settled: real sea only.** Offset from the cut boundary, intersected with `canvas − union(land)`. No provenance tracking. |
| **D6** | A carved lake bands, a painted one does not — resolve? | **Settled: that *is* the mode difference.** Carve makes sea and lakes, with bands; lay makes rivers, without. It is what gives the two modes a visible reason to exist. |
| **D7** | Does `taper` survive? | **Settled: no.** Width is an artistic random walk; a river may be wide in the middle. **This closes `15` H2 permanently** — nothing will ever make width accumulate downstream. |
| **D8** | How is roughness authored? | **Dissolved into D3.** With no stored inputs and no Reroll, width and roughness are tool settings like brush size. Node drag deforms the shape, which is simply outline editing. |
| **D9** | What does hiding the water layer do? | **Settled: the channels close.** Instant toggle, coastline settles after, faded — WP-15's pattern. |
| **D10** | What happens when two water objects overlap? | **Settled: they merge.** Connected components, larger piece keeps the id (ADR-10). Full landmass parity — nothing is lost, because there was never a centreline to lose. **ADR-48.** |
| **D11** | Does the generator make water? | **Settled: not yet.** One negative constraint only: add no field only a hand could supply. |
| **D12** | The 3-unit stroke on a narrow river? | **Settled: accept it.** A river under 6 units reads as a single bold line, which is a real convention for a stream. |
| **D13** | How is the roughness noise indexed? | **Dissolved by D8.** Nothing regenerates, so nothing can be rescrambled. |
| **D14** | What happens to existing rivers? | **Settled: delete them.** See §8 — free only until deploy. |
| **D15** | Is there a minimum water width? | **Settled: no floor.** Variation is **proportional** to base width instead, so a river cannot wander to nothing. |
| **D16** | Water over open sea is invisible — handle how? | **Settled: accept, and preview honestly.** At an estuary it is exactly the behaviour wanted; elsewhere the preview must not let a user commit to nothing. |
| **D17** | When is Reroll available? | **Settled: never.** Undo and draw again. |
| **D18** | How is part of a water body removed? | **Settled: the terrain brush carves water**, mirroring the sea brush carving land. **ADR-49**, which must also record C8. |

## 10. Why this is marked experimental — and what happens next

**Binding, and the reason the status line does not say "approved in shape."**

Every design in this repo so far has been argued to a settled shape and then built. This one is
argued to a settled shape and then **tried**. The difference is that three of its decisions can
only be judged by looking at a finished map:

- **D12** — whether a heavy outline on a narrow river reads as a stream or as a mistake.
- **D7 and D15** — whether an artistic random width looks like a river or like a worm.
- **C2** — whether a two-collection derivation is still fast enough to work in.

None of those can be settled by a fixture, an assertion or a screenshot of seeded state. They are
settled by drawing maps.

**So the batch ends in an evaluation, not in a tick.** When WP-40 … WP-43 pass their acceptance
criteria, the owner uses the editor — draws real maps, watches the look, feels the performance —
and then decides one of:

1. **Accept**, with a few tweaks and adjustments recorded as follow-up packages.
2. **Revamp completely**, in which case this document is superseded and `15-river-engine.md` is
   back on the table as the alternative that was not taken.

Until that decision is recorded here, **treat this design as provisional**:

- **Do not build on it.** No later batch should assume the water model exists.
- **Node editing (D3) waits, and the reason is not what an earlier draft of this section said.**
  It claimed node editing was the batch most expensive to throw away. That overstates the
  coupling: landmasses have outlines regardless of anything here, so the **landmass half is
  unblocked today**, and the shared machinery — the edit mode, the falloff, I5's new rung —
  survives whichever way the evaluation goes. Only the water half depends on this batch, and
  trivially, because a water object is a landmass's shape. **The real reason it waits is §7's
  accepted gap:** the owner chose to feel the loss of point-dragging before deciding what should
  replace it, and building the replacement first would have decided that by default. It stays
  unscheduled until the evaluation, but that is a choice about sequencing, not a dependency.
- **Do not pay down its debt early.** A `ponytail:` comment on something this design created is
  cheaper than a fix to something that may be deleted.
- **Keep the migration reversible in practice**, not merely in principle. §8's deadline exists so
  that a complete revamp remains a code change rather than a data problem.

The evaluation session, if it happens, appends its findings to this section rather than starting a
new document.

---

### The evaluation, 2026-08-14 — **accepted**

**Outcome 1: accept, with tweaks — and the tweaks were taken before the verdict rather than
after.** The owner used the editor across two sessions and returned fourteen specific
corrections; all were applied, and the acceptance followed the corrected build rather than the
one that first passed its acceptance criteria. That ordering is worth recording, because it is
what the "built, then tried" experiment was *for*: three of the corrections moved decisions in
this document, and none of them could have been reached by argument.

**What the three unjudgeable decisions came back as:**

| | Question | Verdict |
|---|---|---|
| **C2** | fast enough to work in? | **Yes**, and measured: water costs 0–10% on top of the ring derivation (WP-40). Two further costs *were* felt and fixed — the terrain layer being cached while the water layer was active, and a 150 ms commit debounce. |
| **D12** | does a heavy outline on a narrow river read as a stream or a mistake? | **Accepted.** Not raised as a complaint in either session. |
| **D7, D15** | does an artistic random width look like a river or a worm? | **Accepted in principle, amended in mechanism.** D15's proportional variation was replaced by an explicit min/max, and D13's roughness became genuine per-bank noise — the width walk alone left a river that was its own mirror image. |

**Three decisions in §9 are therefore amended rather than as-written**: **D15** (bounds, not
proportion), **D13** (noise on the banks, which is what its own wording had always implied), and
**D16** (a pale ghost over open sea rather than nothing — the requirement is that the preview not
*lie*, and blankness said "there is no tool in your hand"). Each is struck through where it stands.
**ADR-50** was added in the same pass, deleting the sea brush's button: once the water layer had a
Sea tab running the identical op, the button was a second visible route to one tool.

**The provisional constraints above are lifted.** Later batches may assume the water model;
node editing (D3) is unblocked and sits on the 0.5 backlog awaiting an ideation session to settle
its shape (`17-vertex-editing.md` V2); the debt this design created may be paid down normally. **DEBT V-02 is deleted with this record** —
both defects it tracked stopped being representable, and its retire-when was this line.

The one thing that does **not** relax: §8's migration deadline was about data, not design, and it
is spent. The v1 → v2 step deletes rivers, and that was free because the owner held the only
drafts. It is not free again.

## 11. Cost

Rough, in the units this project has already been sized in.

| | Package | Size | Blocked on |
|---|---|---|---|
| **WP-40** | Water is a substance | ≈ WP-7, most of it fixtures | nothing |
| **WP-41** | The water brush, and selection | ≈ WP-8 | WP-40 |
| **WP-42** | Land carves water | ≈ half of WP-8 | WP-41 |
| **WP-43** | The spline generator | ≈ WP-8 | WP-40; better after WP-41 |

WP-40 is the only one with no interaction in it, and it carries every geometric risk in the batch.
If the measurement it ends with is bad, the rest of the batch does not start.
