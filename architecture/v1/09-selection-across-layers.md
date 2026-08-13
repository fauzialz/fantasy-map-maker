# Selection Across Layers — One Select Tool, Two Interaction Models

_Design document for **Batch 2** of `prompts/phase-0.5-core-editor-improvement.md`,
scheduled as **WP-18**, **WP-20** and **WP-19** — in that build order, which is not numeric.
Decisions recorded in **ADR-28** and **ADR-29**._

---

## 1. The concept

Today the Select tool edits **one layer at a time**: it hit-tests the active layer, writes
back to the active layer, and greys out entirely on Terrain, which offers no `select`. It
sits in the toolbar as the first of eight buttons, visually a peer of Terrain, Mountains and
Forests.

It is not a peer of those. The toolbar flattens **two different axes** into one row:

| Axis | Buttons | What it means |
|---|---|---|
| **What you are making** | Terrain · Mountains · Forests · Rivers · Icons · Labels | picks the active layer, and so what a press creates |
| **What the pointer does** | Select · Erase | a mode applied to whatever is there |

Select is orthogonal to all six. Presenting it as the seventh sibling is why it reads
oddly, and why "disabled on Terrain" feels arbitrary rather than principled.

**This batch separates the axes and unbinds selection from the active layer.** WP-18 does it
for everything with a footprint. WP-20 then extends the frame to the first path-based type —
rivers, the one where every transform is lossless — and WP-19 brings landmasses in on the
model WP-20 proved, once WP-14…WP-17 have made them transformable.

## 2. Why this is mostly *removing* a restriction

Invariant **I9** already defines the natural selectable set — objects with an anchor and a
drawn box — and already promises what follows:

> Answer **yes** and it is selectable, movable, scalable, rotatable and erasable with no
> further work.

`hasFootprint` answers yes for mountains, trees, landmarks and labels. That set is exactly
"mountains + forests + icons + labels". **The per-layer restriction is narrower than the
invariant it is built on**, and nothing in the architecture asked for it — it is an artefact
of `useSelection` having been written when one layer was all there was.

Four things make WP-18 small:

| | Fact | Where |
|---|---|---|
| **A1** | `useSelection` touches `activeLayerId` in exactly **four** places: the source array, `apply()`, the Delete handler, and the index built from that array. Gestures, frame, snapshots, transforms and cursors are already layer-agnostic — they take `SceneObject[]`. | [useSelection.ts](../../src/canvas/useSelection.ts) |
| **A2** | `SpatialIndex` is **already generic**. `rebuild` skips anything `objectBounds` will not measure, so handing it every layer's objects at once indexes precisely the footprint objects and ignores landmasses and rivers by itself. | [spatialIndex.ts:22-33](../../src/canvas/spatialIndex.ts#L22-L33) |
| **A3** | History **already supports** it. A `Step` carries `LayerDiff[]` and `diffScene` walks every layer, so one cross-layer drag is already one undo step spanning several layers. No history work at all. | [history.ts](../../src/state/history.ts) |
| **A4** | Object ids are `crypto.randomUUID()` everywhere, landmasses included, so a flat `selection: string[]` still identifies objects unambiguously once they can come from several layers. | [assemble.ts:40](../../src/engine/terrain/assemble.ts#L40) |

## 3. Constraints

| | Constraint | Source |
|---|---|---|
| **S1** | Selection is **session state, never serialized**. Nothing here touches the scene shape, so there is no `schemaVersion` bump. | data model §7 |
| **S2** | The perf budget is on **total objects, not per layer** — ~1–2k. A *live* layer costs draw time and no bitmap; a *cached* layer costs a viewport-sized bitmap and almost no draw time. | ADR-19, ADR-20 |
| **S3** | Which interaction model an object uses is decided by `hasFootprint`, not by which layer it lives in. Path-based objects need their own hit-test. | I9 |
| **S4** | Layer order is **fixed** and z-order is **within-layer**. Cross-layer z is meaningless by design, so bring-forward / send-back apply per layer independently. | ADR-15 |
| **S5** | Land never overlaps land, so a drop can resolve to a **different delta than the one dragged** — "keep apart" slides the landmass back along the drag path. | ADR-10/11, `08` C1 |
| **S6** | The pointer must promise exactly what the press will do. A frame with handles that move only part of the selection is the defect I9 exists to prevent. | I4, I9, `08` C6 |
| **S7** | `translateObjects` and friends used to return **every** path-based object untouched — "so a selection can never silently deform terrain". **WP-15 replaced that for landmasses**, which move and rotate by baking into their points; rivers still come back untouched, which is what WP-20 changes. `scaleObjects` still refuses land until WP-16. | [transform.ts](../../src/scene/transform.ts) |
| **S8** | A frame's shape and an object's hit shape are **different things**. An AABB over a meandering path is mostly empty space, so a box may draw the selection but must never pick it — and **"pick" includes the frame-interior move rung**, which is the easy place to break this without noticing. | `08` C4, WP-20 |
| **S9** | The cursor resolves the **same** precedence as the press, always. Changing what a gesture does without changing `cursorForHover` in the same breath is how bug #2 stayed invisible. | I4, §3 bug #2 |

## 4. The packages

### WP-18 · Selection, unlinked from the layer

Ships alone, blocks nothing, and needs no open decision. Independent of Batch 1 — it can
land before, after, or between its packages.

1. **Split the toolbar into two groups**, visually separated: mode (Select, Erase) and
   create (the six layers).
2. **Select goes global** over footprint objects. Click, shift-click and marquee hit-test
   every visible, unlocked layer at once; the active layer stops gating selection and governs
   only what a *creation* tool makes. Terrain and rivers stay out until WP-19.
3. **Lock and visibility become the scoping mechanism.** A hidden or locked layer contributes
   nothing to a hit-test or a marquee. This is what stops a marquee over a forest from
   grabbing 200 trees when you wanted three castles, and it is the first real job the lock has
   had.
4. **Mixed selections show common controls only** — move/scale/rotate, forward/back, delete.
   Type-specific controls (text size, icon kind) appear only when the selection is
   homogeneous.
5. **A layer is live if it is active *or* holds a selected object.** Without this, every drag
   frame invalidates the bitmap of each cached layer holding a selected object and re-caches
   it — a viewport-sized render per layer per frame. Note the direction of the cost: live
   layers hold *no* bitmap, so this **reduces** memory and spends draw time instead, and by
   S2 that draw time is roughly conserved because the budget is on total objects.
6. **Erase keeps its behaviour and gains an honest label** (D-a). It reads **"Sea brush"** on
   Terrain and **"Erase"** elsewhere, so it announces that it is contextual instead of looking
   like a fixed peer of a now-global Select. ADR-18 is unchanged: erasing really is two
   different operations — subtracting land geometry, and removing objects — and one button
   that renames itself is cheaper than an ADR amendment and clearer than either alternative.

- **Acceptance:** a marquee spanning mountains, forests, icons and labels selects from all
  four and moves them as **one undo step** · a locked or hidden layer contributes nothing to
  a click or a marquee · Select is never disabled · the properties rail shows text size only
  when the selection is all labels · bring-forward on a mixed selection restacks each object
  **within its own layer** · **measured**: drag frame time with a selection spanning four
  layers, recorded with its object count. Driven input, not a screenshot.

### WP-20 · Rivers gain a frame  *(the two-model pilot — build this before WP-19)*

> **WP-40 invalidated the premise this package was chosen for, and the record below is kept as
> history rather than as a description of the code.** Rivers were the cheap case *because*
> `width` sat outside the geometry — that is what made all three transforms lossless. Water is
> an outline (ADR-48), so there is no `width` to preserve and nothing lossless left to prove;
> the two-model frame it piloted survives untouched, now with two outline types instead of an
> outline and a ribbon. **Points 2, 3 and 5 below are void**, and each says so where it stands.
> See `16-water-as-objects.md` §7, and I5 for the ladder as it now stands.

Numbered after WP-19 because it was decided later; **sequenced before it**, because it is
the same machinery on the object type with none of the hazards. Blocked on nothing — D1 is
settled and WP-18 has landed.

**Why rivers are the cheap case.** Every constraint that makes WP-19 hard is absent:

| | Constraint on landmasses | Why a river escapes it |
|---|---|---|
| **C1** | land never overlaps land, so a drop resolves to a different delta | rivers overlap *deliberately* — `PALETTE.river` is opaque precisely so a confluence is seamless. No overlap policy, and so **no shared-delta problem**, which is WP-19's single riskiest item |
| **C2** | rings cost 119–488 ms and cannot track a drag | rivers never get rings (ADR-14, data model §4). Nothing to freeze, nothing to re-derive on drop |
| **C3** | coast detail is baked at a Douglas–Peucker epsilon, so scale invalidates it | a river's `points` are the user's own control points, Chaikin-smoothed at draw time. Scaling is lossless — **no re-simplification** |

Move, rotate **and** scale are therefore all lossless for a river. It is the only path-based
type in the scene for which that is true, which is exactly what makes it the right place to
prove the two-model frame before spending it on coastlines.

1. **Three predicates widen, not one.** `objectBounds` and `frameOf` both gate on
   `hasFootprint` and then read `object.x` / `object.rotation`, which a river does not have —
   each needs a path branch. **And so does `selectablePool` in `useSelection`**, which WP-18
   built on the same predicate and which would otherwise keep rivers out of the selection
   entirely. Widening two of the three and not the third produces a river that frames but
   cannot be picked. This is D1's rewrite, and it is the bulk of the package.
2. **`transform.ts` stops refusing.** [Line 9](../../src/scene/transform.ts#L9) is explicit —
   path-based objects come back untouched "so a selection can never silently deform terrain".
   Translate and rotate become a map over `points`. ~~**Scale maps the points *and* multiplies
   `width`**: without that, a river scaled with the map around it comes out a thread.~~ `taper`
   needs nothing — it is a fraction along the path, which every rigid transform preserves.

   > **Void since WP-40.** There is no `width` and no `taper` to carry: water is an outline, so
   > scaling its points scales its width by construction, and the two path types now share one
   > `remapPath` branch rather than having one each.
3. ~~**Bounds come from the control points, not the ribbon.**~~ Chaikin keeps the curve inside
   the convex hull of its inputs, so `AABB(points)` inflated by half the maximum width is a
   correct superset and costs nothing.

   > **Void since WP-40.** There is no centreline to inflate. `worldCorners` returns a water
   > body's outline directly, exactly as it does a landmass's, and the slack this bullet
   > accepted is gone with the superset that needed it.
4. **The frame is feedback. Nothing about it is a hit target — not even its interior.**
   Keep `distanceToRiver` for picking: a meandering river's AABB covers a great deal of open
   water, and picking by box is wrong in exactly the way C4 says it is wrong for a crescent
   continent.

   The same applies to the **move** gesture, which is the part easy to get wrong. I5's ladder
   has a "frame interior" rung — press inside the frame and you drag what is selected. For a
   mountain that is right, because its box hugs its artwork. For a river running corner to
   corner the box is ~95% open water, so that rung would hand you a river drag when you meant
   to marquee, hundreds of pixels from any water. Letting the box claim the press *is the box
   picking*, which is precisely what this constraint forbids (S8).

   **So the interior rung claims a press only when the selection contains at least one
   footprint object, or the press is within grab distance of a selected path.** A path-only
   selection therefore has an **inert interior**: handles and stalk stay live, the water stays
   live, and the empty space inside the rectangle falls through to the marquee.

   *ponytail: a mixed selection — one river plus one distant mountain — still has a claiming
   box, because the rule asks "does this selection contain a footprint object" and not "is
   this press over any of them". Retire it when someone actually hits it; the general form
   costs a per-object test on every press and changes group-drag for sprites, where pressing
   the gap between two selected mountains should keep working.*
5. ~~**Control points beat frame handles.**~~ They genuinely collide: a river's endpoint is
   often precisely *at* an AABB corner, because it is what defines that corner. The ladder
   gains a rung above everything else — control point → frame handle → frame interior →
   object → empty space — and shift still escapes the shortcuts (I5).

   > **Void since WP-40**, which deleted the rung and the `overControlPoint` input with it.
   > The collision was real and will return with node editing, which is unscheduled by choice
   > (`16` D3). I5 carries the ladder as it now stands: handles → frame interior → object →
   > empty space.
6. **The cursor mirrors all of it — I4, and the whole reason bug #2 stayed invisible.**
   `cursorForHover` and `resolveGesture` must resolve the *same* precedence, so the move
   cursor appears over the river's body and **not** over the empty interior of its box, the
   resize cursors appear only on the handles, and the reshape cursor only on a control point.
   A frame whose interior shows "move" while a press there starts a marquee is the same
   defect as the old behaviour, just moved into the pointer.
7. **Nothing existing is lost.** Point-dragging, click-to-select and Delete all stay, and
   with item 4 there is no longer a behaviour to trade away: the box is added, and it takes
   nothing over.

- **Acceptance:** a selected river draws a frame **and** its control points, and dragging a
  control point still reshapes it rather than moving the whole thing · dragging the river's
  **body** moves it rigidly, and one drag is one undo step · **pressing open water inside the
  frame starts a marquee, with no modifier held** · **the cursor over that same open water is
  the marquee cursor, not the move cursor** (I4) · a 360° rotation round-trips · scaling 2×
  doubles the drawn width as well as the length, so the river still reads as the same river ·
  a river and the mountains along it can be selected together and move together (WP-18) ·
  driven input, and the driver sweeps the pointer to read `.mbf-stage` cursors the way `07` §1
  describes, because the cursor is half of what is being asserted.

#### As built

Close to the plan, with one thing the plan did not ask for and one it under-described.

- **The river tool lost its select mode entirely, rather than gaining a peer.** Item 1 said
  three predicates widen; it did not say what happens to the *existing* per-layer pointer
  mode. Leaving it would have meant two hit-tests, two Delete handlers and two undo paths
  for the same gesture, and control points that only worked while the rivers layer was
  active — which is exactly the layer-scoped selection ADR-28 removed. So `useRiverTool` is
  now drawing only, and picking, reshaping and deleting a river all belong to `useSelection`.
  `useRiverTool` lost 142 lines and gained 24; the acceptance "a river and the mountains
  along it move together" became true as a side effect rather than as extra work.
- **`objectBounds` did *not* widen** — item 1 named it, but widening it would have put rivers
  in rbush, where `index.hit` picks by box, which is the very thing item 4 forbids. What the
  frame actually needed was `worldCorners`, and what the marquee needed was a separate
  `pathBounds`. So `landmassBounds` became `pathBounds` over `worldCorners` and the
  containment branch stopped naming a type: land and rivers now share it. `objectBounds`
  stays undefined for both, which is S8 held by construction rather than by remembering.
- **The frame's height is the width, and that is what proves the width scaled.** Item 3's
  inflation by half the maximum width turned out to be the only *drivable* evidence for
  "scaling 2× doubles the drawn width": a point-on-river test is scale-invariant when the
  width scales correctly, so it cannot distinguish the two cases at any offset. The frame
  corner can — it lands half a width further out — and that is exact arithmetic with no
  spline and no grab slack in it.
- **`taper` needed nothing, as predicted.** `isOnRiver` compares against the *maximum* half
  width rather than the tapered one, so picking near a tapered source is generous by design
  and unaffected either way.

**Verified by 21 driven checks and seven mutations.** Each mutation was aimed at one decision
and caught by the check written for it: width stops scaling · the control-point rung leaves
`resolveGesture` · the frame interior stops asking where the water is · rivers leave the
selectable pool · the interior claims every press · rivers stop being framed · the cursor
stops mirroring the control-point rung. The last is I4's own guard and it fails four checks —
a cursor that stops agreeing with the press is not a cosmetic defect.

**And the driver found a bug WP-18 shipped**, one layer above the ladder: with Select on and
an object layer active, empty space still showed the *create* tool's crosshair, promising a
press that would place a mountain where a press actually starts a marquee. `MapStage`'s
cursor fallback now checks `selecting` first. I4 again, and it took a probe that expected a
specific cursor rather than merely "not the wrong one" to see it.

### WP-19 · Terrain joins the selection  *(built)*

**Prerequisite: WP-17 and WP-18.** Available a package earlier in principle — the §7
precondition is met once scale lands at WP-16 — but waiting for WP-17 means all three overlap
outcomes exist, so a mixed drag can never reach a case the overlap policy cannot resolve.

The conflict between the two presentations **dissolves at WP-16**: by then both models
support move, rotate and scale, so one frame over a mixed selection is honest rather than a
broken promise (S6).

1. **Frame** — the ordinary oriented frame with handles, as sprites have now.
2. **The coastline highlight is additive, not a substitute.** Selected landmasses keep
   WP-14's highlighted coastline *as well as* being inside the frame, so you can see which
   land is in the set. Nothing WP-14 built is lost.
3. **Hit precedence: footprint first, landmass as fallback.** A mountain standing on a coast
   wins the click — it is what you see and what is on top. This extends I5's precedence
   ladder rather than replacing it.
4. **The marquee rule goes asymmetric, deliberately.** Footprint objects by **intersection**
   (rbush box search), landmasses by **containment** (WP-14's rule). Clipping the corner of a
   forested continent therefore takes the trees and not the land — which is almost always
   what was meant, and is the reason both rules survive intact.
5. **Scale stays smooth** by reusing WP-15's freeze-and-fade: rings freeze during the drag
   and derive once on drop, and re-simplification also runs once on drop. C2's 119–488 ms
   never lands inside a frame budget.
6. **Properties**: common controls always; the biome palette whenever land is in the
   selection, applying only to the land.
7. **One resolved delta for the whole selection** (S5). This is the part that must be
   designed in rather than retrofitted. "Keep apart" slides the landmass back along the drag
   path to the last position that fit; if the sprites in the same drag used the *requested*
   delta they would end up off the land they were standing on. The overlap resolution runs
   first, and its resolved delta is what every object in the drag receives.
8. **Double-click a landmass selects it and everything standing on it.** Explicit, one
   gesture, no hidden behaviour — and it covers the case where the continent is too large to
   marquee at the current zoom.

- **Acceptance:** a landmass and the mountains on it move together and stay registered when
  "keep apart" slides the drop back · clicking a mountain standing on a coast selects the
  mountain · a marquee clipping a continent's corner takes its trees and not the continent ·
  double-clicking a landmass selects it plus its contents · one ring derivation per drop ·
  the biome palette appears for a mixed selection and recolours only the land · driven input.

#### As built

**Seven of the eight items were already true when the package started.** Not by accident and
not by drift: each was the cheapest thing to build at the moment its own package needed it,
so WP-15 landed the frame and the freeze-and-fade, WP-16 made the handles honest, WP-18
landed the asymmetric marquee and the footprint-first precedence, and WP-20 generalised
`landmassBounds` into `pathBounds` and reused the `frameInterior` flag. **Item 7, the shared
resolved delta — this package's whole risk — was written in WP-15 too**, because the moment
land could be dragged at all, `resolveTerrainDrop` had to decide what the rest of the drag
did, and "the same fraction" was no harder than the alternative. §7's warning that it "must
be designed in rather than retrofitted" was right, and the design landed four packages early.

So what was left was item 8 and two pieces of dishonesty:

- **The double-click** — `standingOn` in [scene/bounds.ts](../../src/scene/bounds.ts).
  Membership is the **anchor**, not the box: a sprite's `x,y` is its feet (`07` §4), so a
  mountain whose artwork overhangs the water is still standing on the land, and asking the
  box would make that a question of which way the art leans. Path objects are deliberately
  out — a river crossing three continents stands on none of them. Lakes come free, because
  `pointInPolygon` is even-odd across every ring: what sits on an island in a lake belongs to
  the island.
- **The rail had gone stale.** Its land-only branch still offered nothing but recolour and
  rename — true when WP-14 wrote it, false since WP-15. A pointer that promises what a press
  does (I4) and a rail that describes what it cannot are the same defect at different volumes.
- **The double-click handler was keyed on the rivers _layer_.** Since WP-20 left that tool
  drawing-only, being on the rivers layer no longer implies a draft is open, so the gesture
  was being swallowed there with Select on. Root cause rather than a second branch: the
  condition is now `river.active`.

**Verified by 14 driven checks and six mutations**, one per decision — the double-click, the
shared delta, `standingOn`'s membership test, marquee containment, hit precedence, and the
ring freeze. Two are worth recording:

- **The riskiest item's check did not work on the first attempt, and passed.** Objects riding
  the _requested_ delta while the land slid back were still standing on the same continent:
  the slip was 360 units against a 1 060-unit landmass, so a containment probe could not see
  it. This is `07` §1's "move by more than the thing you are moving", one layer up — the rule
  applies to the **slip** as much as to the displacement. Overshooting to 2 000 units makes
  the slip 1 260, wider than the landmass, and the strays then land on the neighbour that
  stopped the drag — which a second check now asks about directly.
- **"One ring derivation per drop" is a count, not an inference.** Wrapping
  `Worker.prototype.postMessage` from the driver logs the `op` of every geometry request, and
  it catches the worker the app already created because the method lives on the prototype.
  The drag and drop together send exactly `resolveDrop, deriveTerrain` (`deriveRings` until
  WP-40 folded the land cut into the same op). The HUD's "rings
  frozen" banner is asserted on every frame as well, but the op log is what makes it exact.

## 5. What this does *not* cover

- **Automatic ride-along.** Moving a landmass moves *only* the landmass. Contents come along
  when they are selected too — deliberately, per the product principle that everything is an
  ordinary object and nothing moves that you did not select. WP-19's marquee and double-click
  make selecting them one gesture; that is the whole ergonomic answer, and it means there is
  no containment query at drag time and no policy needed for objects sitting astride a coast.
- **Auto-generated rivers, and rivers as water bodies.** WP-20 gives a river a frame; it
  does not make rivers interact with land, join into networks, or generate themselves. Those
  are v1's deferred items (`01` §15).
- **Cross-layer z-order.** Meaningless by S4, and it stays absent rather than appearing and
  doing nothing.

## 6. Decisions

All settled in the review that produced this document. Recorded with their reasoning because
several were close calls.

| | Decision | Outcome |
|---|---|---|
| **E1** | Split the toolbar into mode and create groups? | **Yes.** The two axes are real; showing them as one row is what made Select read as a broken sibling. |
| **E2** | Select global over footprint objects? | **Yes**, WP-18. Removes a restriction narrower than I9. |
| **E3** | How is marquee over-grab scoped? | **Layer lock and visibility.** Rejected a separate type-filter UI as scope creep for a problem the layer panel already has the controls for. |
| **E4** | Mixed-selection properties? | **Common controls always, type-specific when homogeneous.** |
| **E5** | Does the live-layer rule change? | **Yes** — active *or* holds a selection. Rejected leaving it, which re-caches a bitmap per layer per drag frame. **Measured in WP-18** and it holds: subtracting 62 ms of driver harness, a drag costs ~6 ms for 756 objects in one layer and ~23 ms for 957 across four. Over a 16 ms budget, far under anything that feels broken. The earlier worry that this re-opens ADR-19's memory trap was wrong in direction — live layers hold no bitmap. |
| **E6** | Erase: leave, split, or relabel? | **Relabel** (option 3). Rejected splitting it into a global object eraser plus a terrain-rail mode: it amends ADR-18 and, worse, makes Erase delete objects for someone on Terrain who expected the sea brush. |
| **E7** | Do landmasses join the same selection, and when? | **Yes, at WP-19, after WP-17.** This settles **D1** in `08` §8 — admitting two interaction models is precisely what a shared frame over land and sprites requires. |
| **E8** | Does moving land carry its contents automatically? | **No.** Contents ride only when selected. Considered and rejected: it is hidden behaviour, it needs a containment query and a coast-straddling policy, and the marquee plus double-click give the same ergonomics explicitly. |
| **E9** | Do rivers get a frame too? | **Yes**, WP-20. They are the only path-based type for which all three transforms are lossless, so the two-model frame can be proved there first. **The premise expired at WP-40** — losslessness came from `width` being a number rather than geometry — but the frame it proved did not. |
| **E10** | Does scaling a river change its `width`? | ~~**Yes.** Points alone would leave a river scaled with the map around it drawn as a thread.~~ **Moot since WP-40** (ADR-48): a water body has no `width` and no `taper`, so scaling the outline is the whole answer and the question cannot be asked. |
| **E11** | Does a framed river get picked by its box? | **No — by path**, as now (`distanceToRiver`). The box is feedback only. A meandering river's AABB is mostly open water; picking by box is C4's mistake. **Frame shape ≠ hit shape**, and WP-19 inherits the rule. |
| **E14** | Does the frame's *interior* claim a press for a path-only selection? | **No — inert interior. Shipped early, with WP-15, and for landmasses rather than rivers** — the same complaint arrived about land the moment it could be dragged, and `08` C4 already said a crescent continent's box is mostly open sea. `resolveGesture` and `cursorForHover` both take a `frameInterior` flag; WP-20 reuses it for rivers rather than inventing it. **No — inert interior.** First drafted as "yes, standard vector-editor behaviour, shift escapes", and recorded as a knowing regression. That was wrong: it is S8 being violated by the document that states S8, because the interior rung is the box picking. Handles and stalk stay live; the empty space falls through to the marquee. The regression disappears rather than being documented. |
| **E15** | And the cursor? | **Mirrors it exactly** (S9). The move cursor appears over the river's body and nowhere else inside the box. Raised in review, and it is the half that would have been forgotten — a pointer promising a move where a press marquees is bug #2 with the parts swapped. |
| **E12** | Control points or frame handles, when they collide? | **Control points win.** They collide often, not rarely: a river's endpoint is usually what defines the AABB corner a handle sits on. |
| **E13** | Rivers before or after landmasses? | **Before.** Same machinery, none of C1/C2/C3, and a bug costs a misplaced river rather than a re-simplified coastline and a 488 ms ring derivation. WP-20 de-risks WP-19. |

## 7. Cost

Build order is **WP-18 → WP-20 → WP-19**, which is not numeric: WP-20 was decided after
WP-19 was written down, and belongs before it.

| | Package | Size | Blocked on |
|---|---|---|---|
| **WP-18** | Selection unlinked from the layer | ≈ half of WP-7 — four bindings, a toolbar regroup, and a live-layer rule | nothing · **done** |
| **WP-20** | Rivers gain a frame | ≈ half of WP-15 — two path branches, three transforms, one precedence rung | nothing |
| **WP-19** | Terrain joins the selection | ≈ WP-7 | WP-17 and WP-20 |

WP-18 was almost entirely deletion and rewiring: the index, the history and the transforms
already worked on plain object arrays. WP-20 buys the two-model frame where every transform
is lossless. WP-19 is the largest, and item 7 — the shared resolved delta — is where its risk
sits; by the time it starts, everything except that item has already run on rivers.
