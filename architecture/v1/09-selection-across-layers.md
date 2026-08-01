# Selection Across Layers — One Select Tool, Two Interaction Models

_Design document for **Batch 2** of `prompts/phase-0.5-core-editor-improvement.md`,
scheduled as **WP-18** and **WP-19**. Decision recorded in **ADR-28**._

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
for everything with a footprint. WP-19 brings landmasses in, once WP-14…WP-17 have made them
transformable.

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
| **S7** | `translateObjects` and friends deliberately return path-based objects **untouched** — "so a selection can never silently deform terrain". Until WP-15/WP-16 replace that, a landmass in a selection is a landmass that will not move. | [transform.ts:9](../../src/scene/transform.ts#L9) |

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

### WP-19 · Terrain joins the selection

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

## 5. What this does *not* cover

- **Automatic ride-along.** Moving a landmass moves *only* the landmass. Contents come along
  when they are selected too — deliberately, per the product principle that everything is an
  ordinary object and nothing moves that you did not select. WP-19's marquee and double-click
  make selecting them one gesture; that is the whole ergonomic answer, and it means there is
  no containment query at drag time and no policy needed for objects sitting astride a coast.
- **Rivers.** They stay on their own tool. `08` §6 already notes that once landmasses are
  selectable, "path-based objects are not selectable" becomes an exception list of one;
  giving rivers the same treatment is a separate decision, not a freebie.
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

## 7. Cost

| | Package | Size | Blocked on |
|---|---|---|---|
| **WP-18** | Selection unlinked from the layer | ≈ half of WP-7 — four bindings, a toolbar regroup, and a live-layer rule | nothing |
| **WP-19** | Terrain joins the selection | ≈ WP-7 | WP-17 and WP-18 |

WP-18 is almost entirely deletion and rewiring: the index, the history and the transforms
already work on plain object arrays. WP-19 is the larger one, and item 7 — the shared
resolved delta — is where its risk sits.
