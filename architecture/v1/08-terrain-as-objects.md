# Terrain as Objects — Selection, Colour and Transforms

_Status: **Approved in shape · scheduled as WP-14 → WP-17**, the first work after P0 ships.
Written after WP-10, in response to "landmasses should be selectable like mountains are."
Deliberately sequenced **after WP-13**: every tier needs the real UI that WP-13 builds — a
biome palette, a rail settings group, toasts carrying actions — and rewriting invariant I9
on top of a stand-in rail would be rework. Recorded as **ADR-25**; tracked in
`05-p0-build-checklist.md`. This document is the **design**; the **work order** an agent
follows is `prompts/phase-0.5-core-editor-improvement.md` (Batch 1). §8 says what is settled
and what is still open._

## 1. The concept

> Each landmass can be selected when clicked. Multi-select too. When selected, show the box
> overlay just like forests and mountains do. Landmasses can then be moved, resized,
> rotated, and given a colour via a palette.

Today none of that is possible. `biome` is only ever written by the generator; the brush
hardcodes `"grassland"` ([boolean.ts:52](../../src/engine/terrain/boolean.ts#L52)), and
landmasses are excluded from the selection stack by design.

## 2. Why this is not "widen `hasFootprint`"

Invariant **I9** (`07-interaction-invariants.md`) says path-based objects must bring their
own tool, and warns exactly against the shortcut:

> handing it a footprint instead would hang scale handles off geometry that
> `translateObjects` deliberately refuses to move, so the frame would promise a drag that
> silently does nothing.

That refusal is explicit in [transform.ts:9](../../src/scene/transform.ts#L9) — "so a
selection can never silently deform terrain." This document proposes **rewriting I9**, not
working around it. §7 has the replacement text.

The seam is deeper than one predicate. `objectBounds` returns `undefined` without a
footprint, so landmasses never enter the rbush; and `SpatialIndex.hit` independently
requires `"y" in object` and ranks candidates *by* `y`
([spatialIndex.ts:42](../../src/canvas/spatialIndex.ts#L42)). A landmass has neither an
anchor nor a `z`.

## 3. Constraints

Each of these is load-bearing. A design that violates one produces a defect that
type-checks and looks fine in a screenshot.

| | Constraint | Source |
|---|---|---|
| **C1** | Land never overlaps land. Every brush commit runs union + connected-components; two overlapping landmass objects are a state the engine cannot otherwise produce, and each would stroke its own coastline through the middle of the other. | ADR-10, ADR-11 |
| **C2** | Rings are derived, and derivation costs **119–488 ms** (measured, 4000×3000, ringCount 4). A frame is 16 ms. Rings cannot track a drag. | ADR-13, measured |
| **C3** | Coastline detail is baked in **map units** — the Douglas–Peucker epsilon was chosen at commit time. Scaling geometry invalidates it. | S4, ADR-12 |
| **C4** | Hit-testing must be point-in-polygon. A crescent continent's AABB covers open sea; clicking a bay must not select the continent. | new |
| **C5** | Landmasses have no `x/y/rotation/scale/z`. Geometry is absolute, so transforms **bake**; there is no z to break ties with. | data model §4 |
| **C6** | The pointer must promise what the press will do. | I4 |
| **C7** | The scene schema does not change. Baking into `path`/`holes` keeps §4 intact; storing a transform instead would need a `schemaVersion` bump and a `migrate()` step. | ADR-23 |
| **C8** | One biome per landmass. Sub-landmass biome regions are the deferred "rich blended biome transitions", not a v1 shape. | data model §4, §15 |

### Two flaws that C1 dissolves for free

Because **every drop resolves overlap** (§5), two landmasses can never overlap at rest.
That is not a nicety, it is what makes the rest cheap:

- **At most one landmass contains any given point**, so the hit-test needs no "topmost"
  rule and C5's missing `z` never comes up. (An island inside another's lake is not an
  exception: `landmassAt` already tests `inside outer && not inside any hole`, so the
  parent does not claim points in its own lake.)
- **Draw order among landmasses never matters**, so bring-forward / send-back stay absent
  rather than appearing and doing nothing.

Keep this invariant and terrain selection stays simple. Break it — allow resting overlap —
and `z`, draw order, and a topmost rule all come back at once.

## 4. The tiers

Split on **which operations are lossless**, not on which feel related. Translation and
rotation are rigid: every point moves, nothing degrades. Scale is the only destructive one.

### T1 · WP-14 — Select & colour  *(no transforms, no invariant rewrite)*

**Scope.** A `select` tool on the terrain layer. Click selects the landmass under the
pointer; shift-click adds and removes; marquee selects. Selection draws as a **highlighted
coastline, not a transform frame**. A properties strip offers the biome palette, the name
field, and delete.

**Design.** *(Revised as built — WP-18 landed first and changed the shape. The original
plan for a terrain-only select tool is struck through in spirit: it would have been a
parallel selection mechanism that WP-19 then deleted.)*
- Hit-test with `pointInPolygon`, reusing `landmassAt` — **promoted to
  [scene/bounds.ts](../../src/scene/bounds.ts)** as planned, since selection and the
  generator's scatter now ask the same question.
- ~~Terrain gains a tool switch (`brush | sea | select`)~~ — **not needed.** ADR-28 already
  made `select` a global mode that is live on every layer including terrain, and already
  makes the brush stand down while it is on. Landmasses simply **join the existing selection
  pool**, where `SpatialIndex` ignores them of its own accord because `objectBounds` returns
  undefined for a path object. Hit precedence is footprint first, land as the fallback.
- **"No handles" is now structural rather than a rule to remember.** `frameOf` filters by
  `hasFootprint` too, so a land-only selection cannot grow a frame. `landmassBounds` is kept
  deliberately *separate* from `objectBounds` for exactly this reason — widening
  `objectBounds` is WP-19's job, once the transforms behind those handles work.
- Cursor follows (C6): `cursorForHover` resolves the same precedence, land included.
- **No handles.** This is the point of shipping T1 alone: a frame with handles that do
  nothing is precisely the failure I9 describes. An outline says "selected" and promises
  nothing else.
- Marquee rule: a landmass is caught when its bounds are **fully contained** by the
  marquee. "Intersects" would grab a continent from a marquee over one bay.
- Biome writes through `record("set biome", …)` — one undo step, per ADR-22.

**Acceptance.** Click a small island inside the bounding box of a crescent continent and
the island is selected, not the continent. Shift-click deselects. The palette recolours the
selection, and one undo reverts it. Delete removes a landmass and the rings re-derive
without it. Painting still produces grassland unless the palette says otherwise.

**Fixtures.** `landmassAt` returns the island, not the enclosing crescent's bbox owner ·
returns nothing for a point in a lake · returns the island for a point on an island *in* a
lake · marquee containment accepts a fully-enclosed landmass and rejects a partly-covered
one.

### T2 · WP-15 — Move & rotate  *(rigid; where the overlap policy lands)*  — **built**

**Scope.** Handles appear. Move and rotate the selection; both bake into `path`/`holes`.

**Design.**
- `translateObjects` / `rotateObjects` gain a path-based branch: rewrite every point of
  `path` and every hole. Both are rigid, so no re-simplification and no fidelity loss.
- Frame and handles reuse `frameOf` unchanged, over landmass ring bounds.
- **Ring suspension (C2).** While a terrain drag is in progress, `useCoastalRings` holds
  its last bands and derives nothing; one derivation fires on drop. Rings **fade to ~25%
  opacity during the drag** so the staleness reads as deliberate rather than broken.
  Without this, every mousemove changes `landmasses` and the latest-wins hook runs
  back-to-back derivations for the whole drag, saturating the worker.
- **Overlap resolves on drop**, per §5.
- Off-canvas: a landmass may hang partly off the canvas (it is bounded, ADR-02, and rings
  clip to the canvas rect) but not leave it entirely — clamp so its bounds still intersect.
- One drag = one undo step, the existing WP-9 snapshot rule (I6). The step stores the
  before/after geometry of only the landmasses that moved, which is what §13 already asks
  for.

**Acceptance.** Drag a continent: it moves rigidly, its lakes move with it, rings fade
during the drag and re-derive once on drop. Rotate a landmass 360° in one drag and the
geometry is unchanged to within `1/SCALE`. Move three selected landmasses and undo once —
all three return. The worker runs exactly one derivation per drop, not per frame.

**Fixtures.** A translated ring has identical area and identical relative point spacing ·
a rotation by 360° round-trips within tolerance · lakes translate with their parent · a
drag that ends off-canvas is clamped.

### T3 · WP-16 — Scale  *(destructive; needs re-simplification)*  — **built**

**Scope.** Scale handles become live.

**Design.**
- `scaleObjects` rewrites points about the frame origin, then **re-simplifies** the result
  at the epsilon implied by the scene's `coastDetail`, so a coastline scaled 4× does not
  end up 4× coarser than every other coast on the map (C3). Scaling *down* re-simplifies
  too, shedding points the new size cannot show.
- Re-simplification runs in the worker on drop, not per frame.

> **Correction, from building it: simplification alone only fixes one direction.** ε is a
> tolerance in map units, so scaling *down* leaves points closer together than ε and
> Douglas–Peucker sheds them — exactly as written above. Scaling *up* is the opposite: the
> points are already further apart than ε, so there is nothing to remove, and no amount of
> simplification invents detail that was never recorded. The count would stay put while the
> coastline got four times longer, which is precisely the "4× coarser" this bullet set out
> to prevent.
>
> So scale-up **resamples**: Chaikin first — the same S3 the brush uses to turn a traced
> contour into a coastline, and it rounds exactly the long straight runs that scaling made
> visible — then simplify at ε to trim what the new size still cannot show, which is what
> keeps repeated scale cycles from growing the point count without bound. Passes are
> `log2(factor)`, capped at 3. `engine/terrain/rescale.ts`.
>
> Measured end to end on a scaled island: perimeter 1 311 → 3 287 map units, points 18 → 30,
> **density 13.7 → 9.1 per 1 000 units** where stretching alone would have left 5.5.
- **Open question (D4):** whether `ringGap` scales with the landmass. It cannot, per
  landmass — `ringGap` is a global setting and rings derive from the union, so a scaled
  landmass simply gets proportionally tighter banding.

**Acceptance.** Scale an island up 4× and its coastline has proportionally similar point
density to a hand-painted coast of the same size, not four times coarser. Scale down and up
again and the point count does not grow without bound.

**Fixtures.** Point density after scale-up is within a factor of ~1.5 of a freshly
committed coastline at the same size · repeated scale cycles do not grow the point count
monotonically.

## 5. The overlap policy

Three outcomes were requested. All three are specifiable; they differ enormously in cost.

### Merge — free
`unionLand` + `splitByComponents`, exactly what the brush does. ADR-10's identity rule
applies (larger piece keeps id/name) and the existing undo-able toast already reports it.

### Keep apart — cheap, if formulated correctly
"Move it slightly" has no well-defined answer for concave shapes: dropped into a C-shaped
bay, the nearest non-overlapping position can be a thousand units away in a direction
nobody dragged, and nudging out of A can push into C without converging.

**The formulation that works: slide back along the drag path** to the last position that
fit. Binary-search the drag vector, ~10 overlap tests at a few ms each, on drop only.
Deterministic, convergent, and it reads as "it slid back to where it last fit."

**Generalised in WP-15 from "the drag vector" to "the gesture".** Rotation can bury a
landmass in its neighbour exactly as a translation can, and C1 does not care which one did
it. So the resolver takes the **snapshot plus a described gesture** — `{move, delta}` or
`{rotate, origin, degrees}` — and replays it at fraction *t* using the very transforms the
drag used, searching *t* instead of a vector. A rotation therefore walks its angle back to
the last orientation that fit, which reads the same way.

### Carve a strait — best-looking, most dangerous  *(WP-17)*  — **built**
```
dropped' = differenceLand(dropped, offsetGrow(other, gap))
```
The ring engine renders the resulting channel beautifully — that is the strait fixture.
Three hazards, each needing an explicit rule:

1. **It can split the dragged landmass** into several pieces. One drag, three objects.
   Falls out of `splitByComponents`, but the identity toast must say so.
2. **It can annihilate it** when the dragged landmass is smaller than the other's grown
   footprint. **Rule: if the carve would leave less than ~20% of the original area, fall
   back to slide-back instead.** Silently deleting what someone just dragged is not an
   acceptable outcome.
3. **The cut edge is machine-straight** — a perfect parallel channel tracing the other
   coastline, which is the opposite of a natural coast. Re-roughening it (noise
   displacement along the cut, then re-simplify) is new code, not a parameter, and is the
   single largest piece of work in this document.

> **As built (`engine/terrain/roughen.ts`).** The whole problem is knowing *which points are
> new*, and the cheap answer turned out to be exact: the boolean copies surviving vertices
> through verbatim and both sides pass through the same `SCALE` rounding, so an untouched
> point matches its original bit for bit. Set membership, O(n) — where measuring distance to
> the grown polygon would be O(n·m) and would still need a tolerance to guess with.
>
> Displacement is simplex noise along **arc length**, not vertex index, because the cut's
> point spacing is not uniform. It is **tapered to zero at both joins** (`sin πu`), or the
> displacement steps off a cliff where the cut meets the coast that was already there and
> the join reads as a defect. Amplitude is `gap × 0.3` so a wiggle narrows the strait without
> closing it — and an overlap check afterwards is what *guarantees* that rather than hopes,
> falling back to the smooth cut if roughening nibbled into the neighbour.
>
> **The noise is sampled from a seeded phase, not from zero.** Simplex noise is exactly zero
> at every lattice point, so starting each run at `travelled = 0` gives every cut an
> accidental flat spot at its start — and, less obviously, makes a test of the taper unable
> to fail, because both ends then read zero whether the taper exists or not. That is how it
> was found.

### Where the choice is made — a radio, read before the drag

**Decided (ADR-25):** a three-option radio group in the terrain panel — **on overlap: keep
apart · merge · carve** — read at drop time. Mechanically the same control as the
canvas-preset radios already in the rail.

**Default: keep apart.** A default is what happens when nobody chose, so it has to be the
outcome that cannot lose work. Merge is destructive: two objects become one and an id
disappears. Carve can cut a landmass into pieces, or erase it outright. Sliding back along
the drag path changes only a position — nothing fuses, nothing is cut, and the worst case
is a drag that visibly didn't take. Merge and carve stay one click away for when they are
what you actually want.

**Not a modal.** A dialog on every overlapping drop interrupts a direct-manipulation
gesture at the worst possible moment and repeats for every nudge. It also cannot satisfy
**C6**: a modal appears *after* the press, so the pointer cannot promise the outcome, while
a setting read before the drag lets the cursor advertise it. (`window.confirm` cannot
express three options either, so a prompt would block on WP-13's dialog work regardless.)

**Reporting.** The outcome is announced by the existing toast, carrying **Undo** plus the
other two outcomes as one-click alternatives — the pattern WP-3's split/merge toast already
uses. The setting picks the default path; the toast covers the exception. No blocking
prompt in either direction.

## 6. What this does *not* cover

- **Sub-landmass biomes.** One biome per landmass (C8). Two colours means two landmasses.
- **Rivers.** Not this document's business, but the separate decision it called for **has
  since been taken and built**: `09-selection-across-layers.md` scheduled rivers as **WP-20**,
  *before* WP-19 — every transform is lossless on a river. In the event WP-15 got there first,
  so the two-model frame was debugged on coastlines and rivers then cost about half of it.
- **Non-destructive transforms.** Would need a schema bump (C7).
- **Selecting land and sprites together.** This document gives terrain its own selection on
  its own layer. Putting landmasses into the *same* selection as mountains and labels is
  **WP-19**, in `09-selection-across-layers.md` — it needs all three tiers below plus WP-18,
  and it is where the shared-delta consequence of §5's "keep apart" gets resolved.

## 7. Proposed replacement for invariant I9

> **I9 — Two interaction models, and which one an object belongs to.**
> Objects with an anchor and a drawn box (`hasFootprint`: sprites, labels) are hit-tested by
> their box, indexed in rbush by AABB, and transformed about their anchor. Path-based
> objects (landmass, river) have absolute geometry: they are hit-tested **by their path**,
> and transforms **bake into their points**. Both models may present the same frame and
> handles — but only once the transforms behind those handles actually move the geometry.
> A frame that promises a drag the transform refuses is the defect this invariant exists to
> prevent. When adding an object type, decide which model it uses before drawing anything.

## 8. Decisions needed

| | Decision | Status |
|---|---|---|
| **D1** | Rewrite I9 to admit two interaction models? | **Settled: yes**, per §7 — decided alongside Batch 2 (`09-selection-across-layers.md`, **ADR-28**), because a shared frame over land and sprites is exactly what two models licenses. **WP-15 is unblocked.** |
| **D2** | Ship in tiers, or all at once? | **Settled: tiers**, scheduled WP-14 → WP-17 after P0. |
| **D3** | Overlap policy: setting or modal? | **Settled: radio group in the terrain panel, default "keep apart"** (ADR-25). |
| **D4** | Does `ringGap` stay global when land is scaled? | **Settled: yes**, in WP-16. It could not be otherwise without changing what rings are: they derive from the **union** of all land (ADR-13), so there is no per-landmass gap to scale. A scaled landmass simply gets proportionally tighter banding, which reads as a bigger island rather than a differently-drawn one. |
| **D5** | Is "carve a strait" in T2 or its own package? | **Settled: its own, WP-17.** Roughening the cut edge is larger than the rest of T2 combined. |
| **D6** | Does the brush paint the chosen biome directly? | **Settled: yes**, shipped in WP-14. `TerrainCommit` carries a `biome`, and `splitByComponents` already took one — existing landmasses keep their own, only new components take the brush's. The palette does double duty: it recolours a selection, or sets what the brush paints next. |

## 9. Cost

Rough, in the units this project has already been sized in:

| | Package | Size | Blocked on |
|---|---|---|---|
| T1 | **WP-14** select & colour | ≈ WP-8 | nothing (D6 is a five-line yes/no) |
| T2 | **WP-15** move & rotate | ≈ WP-7 | D1 — the I9 rewrite |
| T3 | **WP-16** resize | ≈ half of WP-7 | D4 |
| — | **WP-17** carve a strait | ≈ WP-7 | WP-15 |

WP-14 is the only one that ships without answering an open question, and it is the one that
delivers the biome control this whole thread started from.
