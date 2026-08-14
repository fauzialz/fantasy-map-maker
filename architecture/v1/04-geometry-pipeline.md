# map.byfauzi.com — Geometry Pipeline Spec v1

_The deep, fixture-backed spec for the highest-risk part of the app: turning brush
strokes (and generator noise) into clean, editable landmass polygons, and deriving the
coastal rings. Referenced by `prompts/phase-0-core-editor.md` WP-2, WP-4, and WP-10._

## Why this is a separate document

This pipeline is (a) the load-bearing wall of the editor, (b) the part most likely to
go wrong, and (c) **reused wholesale by the generator**. Both the terrain brush and the
noise generator feed the *same* stages. Specifying it once, as pure testable functions
with fixtures, avoids duplication and lets an agent build → verify → advance instead of
writing the whole pipeline and debugging a black box.

## Design principles

1. **Pure functions.** Every stage is `input → output` with no hidden state. Stages
   compose into pipelines; each is unit-testable in isolation. **One deliberate exception:**
   S1 `stampMask` mutates and returns the same mask, because copying a multi-megabyte buffer
   on every pointermove is the one unaffordable purity. It is marked in the code and is not
   expected to change.
2. **Fixtures first.** Every stage ships with golden fixtures (known input → expected
   output). The agent must make a stage pass its fixtures before wiring it into the
   pipeline.
3. **Worker-hosted.** The heavy stages (2b onward, all of §4) run in the geometry Web
   Worker. The main thread only sends inputs and applies results.
4. **One commit = one undo step.** A brush stroke or a generate produces exactly one
   command (see `01-system-design.md` §13).

## Coordinate & precision conventions (read before coding any stage)

- **Map-space** is the canonical coordinate system (0..canvas.w, 0..canvas.h), floats.
- **Clipper/boolean/offset libs require integer coordinates.** Define a single module
  constant `SCALE = 100` (2 decimal places of sub-pixel precision). Convert map-space →
  int with `round(v * SCALE)` before any boolean/offset op, and back with `v / SCALE`
  after. **Never mix scaled and unscaled coords** — the #1 source of silent geometry
  bugs.
- **Winding:** outer rings CCW, holes CW (even-odd fill). Normalize winding at assembly
  (stage 2f); assert it in fixtures.
- **Degenerate handling:** drop rings with < 3 points or ~zero area; snap near-duplicate
  consecutive points.

## Worker message protocol

```ts
// request
{ id: string, op: "terrainCommit" | "generate" | "deriveTerrain" | "resolveDrop", payload: {...} }
// response
{ id: string, ok: true, result: {...} } | { id: string, ok: false, error: string }
```
Ops are coarse (one round-trip per user action); stages are internal to the Worker.

**At most one op of a kind in flight.** A worker task cannot be interrupted once it starts —
there is no preemption, and `terminate()` is the only hard stop. Ignoring a result on arrival
does not save the work: it already ran to completion. So any caller that can outpace the
worker — ring derivation during a burst of terrain edits, a generator re-roll held down —
must keep **one request in flight** and re-fire with whatever is current when it returns.
Posting one message per change is how a 500 ms op becomes a minute of obsolete work queued
ahead of the only answer anyone wants.

---

## Stage catalog (the pure functions)

Each entry: **signature · what it does · pinned detail · fixtures**.

### S1 `stampMask(mask, from, to, brushSize) → mask`
Paint a filled-circle brush from the previous pointer sample to the current one.
- **Pinned:** interpolate along the segment at ≤ `brushSize/2` spacing so fast drags
  leave **no gaps**. Mask is a 1-bit offscreen buffer at a fixed internal resolution
  (independent of zoom). (Runs on the main thread for live preview; the final mask is
  shipped to the Worker on commit.)
- **Fixtures:** a fast diagonal segment yields continuous coverage (no holes);
  doubling `brushSize` ~4× the painted area.

### S2 `maskToContours(mask) → { outer:Ring, holes:Ring[] }[]`
Marching-squares trace of the binary mask into pixel-space rings, grouped by connected
component.
- **Pinned:** `d3-contour` (same marching-squares algorithm, ISC rather than the
  `marching-squares` package's AGPL — see `terrain/contours.ts`); return **one group per
  component**, each with its
  outer ring and any hole rings.
- **Fixtures:** `circle → 1 group, 0 holes` · `donut → 1 group, 1 hole` ·
  `two-blobs → 2 groups`.

### S3 `chaikin(ring, iterations=2) → ring`
Corner-cutting smoothing.
- **Fixtures:** point count grows ~2× per iteration; max turn-angle drops; endpoints of
  a closed ring stay closed.

### S4 `simplify(ring, coastDetail) → ring`
Douglas–Peucker simplification.
- **Pinned:** `simplify-js` with `epsilon = lerp(0.5, 8, coastDetail)` in map-space
  (coastDetail 0 = very smooth/few points, 1 = rough/detailed). `highQuality: true`.
- **Fixtures:** point count is **monotonic** in coastDetail; a coastline fixture stays
  visually recognizable at both extremes.

### S5 `toMapSpaceInt(ring, transform) → IntRing` / `fromMapSpaceInt(IntRing) → ring`
Pixel→map-space, then map-space→scaled-int (and inverse).
- **Fixtures:** round-trip error < 1/SCALE; winding preserved.

### S6 `assembleLandmass(group, biome) → LandmassObject`
Build a scene `landmass` (data-model §4): outer `path` + `holes`, normalized winding,
default `biome`, fresh `id`.
- **Fixtures:** output validates against the `landmass` type; CCW outer / CW holes.

### S7 `unionLand(newPolys, existingLand) → Polygon[]`
Boolean-union new regions with **overlapping** existing landmasses; detached regions
stay separate.
- **Pinned:** `polygon-clipping` union, on scaled-int coords.
- **Fixtures:** overlapping strokes → 1 polygon; disjoint → 2.

### S8 `differenceLand(existingLand, eraseRegion) → Polygon[]`
Subtract the sea/eraser region from land (used by WP-3).
- **Fixtures:** a cut through a blob → 2 polygons; an interior subtraction → 1 polygon
  with a new hole.

### S9 `splitByComponents(polys) → LandmassObject[]`
Connected-components normalization after S7/S8: one object per disjoint polygon-with-
holes.
- **Pinned identity rule:** on split/merge, **the larger-area piece keeps the source
  id/name**; smaller pieces get fresh ids + empty names (emit an undo-able toast). See
  ADR-10.
- **Fixtures:** a fixture where one landmass splits in two → the larger keeps the id.

### S10 `landUnion(landmasses) → MultiPolygon`
Union of **all** landmasses (holes included) into one MultiPolygon. Input to rings.
- **Fixtures:** adjacent/overlapping lands merge into one; holes preserved.

### S11 `waterRegion(canvasRect, landUnion) → MultiPolygon`
`canvasRect − landUnion`. The clip region for rings. **Lakes (holes) and the outer sea
are both water.**
- **Fixtures:** a land-with-lake fixture → water includes both the lake interior and
  the surrounding sea.

### S12 `offsetGrow(landUnion, distance) → MultiPolygon`
Positive polygon offset (grow land outward by `distance`, in scaled-int).
- **Pinned:** Clipper (`clipper-lib`), `JoinType=Round`. `polygon-offset` was tried and
  dropped: it offsets every edge into its own polygon and unions the pile through
  `martinez-polygon-clipping`, costing ~O(n²) in coastline points and throwing outright
  past a few thousand — a generated archipelago took 29s to fail where Clipper takes
  0.5s. Growing the union expands the
  coast into the ocean **and** shrinks lake-holes → both ring directions from one op.
- **Fixtures:** area increases monotonically with distance; a hole shrinks and
  eventually closes.

### S13 `ringBands(landUnion, ringCount, ringGap) → MultiPolygon[]`
`band(i) = offsetGrow(i·gap) − offsetGrow((i-1)·gap)` for i in 1..ringCount
(band 1 uses the land union itself as the inner boundary).
- **Fixtures:** bands are disjoint and mutually adjacent; count == ringCount.

### S14 `clipRings(bands, waterRegion) → MultiPolygon[]`
Intersect each band with the water region.
- **⭐ THE STRAIT FIXTURE (the whole reason for the union approach):** two islands
  100px apart with `ringGap=14, ringCount=4`. Assert the bands between them form **one
  merged band with no pinch and no double coverage** — not two colliding ring sets. If
  this fixture passes, the signature effect is correct.
- **Fixtures:** rings never cover land or another island's interior; ocean + lake rings
  both present.

---

## Pipeline A — terrain brush commit (WP-2 + WP-3)

Main thread, on `pointerdown…move`: **S1** into the live mask (preview).
On `pointerup`, post `terrainCommit { mask, transform, coastDetail, existingLand }`:

```
S2 maskToContours
  → per group: S3 chaikin → S4 simplify → S5 toMapSpaceInt → S6 assembleLandmass
  → S7 unionLand (brush) OR S8 differenceLand (sea/eraser)
  → S9 splitByComponents
→ result: updated landmass objects  → apply as ONE command (WP-9)
→ trigger rings recompute (Pipeline C), debounced
```

**Package acceptance (WP-2/WP-3):** each stage passes its fixtures; end-to-end, painting
produces clean editable landmasses that union on overlap and split on cut; the coast-
detail slider visibly changes smoothness; all heavy work is off the main thread.

## Pipeline C — coastal rings (WP-4)

On terrain **or water** commit (debounced), post
`deriveTerrain { landmasses, waters, canvasRect, ringCount, ringGap, rings }`:

```
S10 landUnion  ─┬─→ cutUnion(land, water) ──→ S13 ringBands → S14 clipRings ──→ bands
                │                                                 ↑
       waterUnion(waters) ──→ cutLand(landmasses, water) → land   │
                │                                                 │
                └─────────→ S11 waterRegion(canvas, land) ────────┘
→ render bands into the cached rings layer, and the cut land into the terrain layer
```

**Renamed from `deriveRings` by WP-40** (ADR-47), which added the first half of that diagram.
Bands now grow from the **cut** boundary — `union(land) − union(water)`, so they follow a
river's banks — while S11's water region is still built from the **pre-cut** land, which is the
only thing keeping a band out of the channel the river opened (`16` D5). The two halves are
one op because both need `union(water)` and the cut, and ops here are coarse by design.

**`land` comes back null when there is no water**, and the renderer then draws the stored
landmasses directly. That fast path is why a map with no rivers pays nothing for this.
- Skip entirely when `settings.coastalRings` is off (toggle is instant, no recompute).
- **Edge cases (each a fixture):** no land (empty result); land touching the canvas edge
  (clip bands to bounds); lake smaller than `ringGap` (rings fill/stop cleanly).

**Package acceptance (WP-4):** rings radiate from every coast and inward around lakes;
the strait fixture passes; toggling is instant; editing terrain updates rings without
blocking the UI.

## Pipeline B — generator terrain (WP-10, terrain half)

The generator produces a mask instead of a brush, then **reuses S2→S9 unchanged**:

```
noiseElevation, noiseMoisture, latitudeGradient (Simplex)
→ threshold elevation at seaLevel → binary land mask
→ [reuse Pipeline A from S2: contours → chaikin → simplify → assemble → splitByComponents]
→ filter speck islands (area < minIslandArea)
→ Pipeline C for rings
```
Generator-specific stages (scatter, biomes, budget) are specified in the WP-10 steps in
the phase-0 prompt; only the **terrain geometry** reuses this document.

---

## `fixtures/` convention

Co-locate fixtures with the engine, e.g. `src/engine/__fixtures__/`:

```
<stage>.<case>.input.json     // the input (mask as RLE or point rings)
<stage>.<case>.expected.json  // expected output (rings / polygons / counts)
```
- Masks stored as run-length or a small PNG + loader; polygons as point arrays.
- A shared `assertRingsEqual(a, b, tol)` compares geometry within a tolerance (float
  compare is forbidden — always compare within `tol`, default `1/SCALE`).
- **Minimum fixture set to ship:** S2 {circle, donut, two-blobs}; S4 {coastline at
  coastDetail 0 and 1}; S7 {overlap, disjoint}; S8 {cut, interior}; S9 {split-keeps-
  larger-id}; S11 {land-with-lake}; S14 {**strait**, ocean+lake}.
- **Starter provided:** `fixtures/` in this folder contains ready-to-port fixtures for
  the highest-risk stages (strait/S14, S2, S7, S9, S11) as input + property assertions,
  with the assertion vocabulary and evaluator contract in `fixtures/README.md`. Port
  them into the app's engine test suite and extend to the full minimum set above.

## Cross-cutting gotchas

- **Scaling:** convert to int exactly once at the boolean/offset boundary; convert back
  exactly once. Assert no stage receives mixed-scale input.
- **Winding:** normalize at S6; a wrong-wound hole renders as solid land.
- **Empty/degenerate:** every stage must no-op gracefully on empty input (no land, one
  point, zero-area ring).
- **Determinism:** the generator's noise seed lives in `scene.generator` as metadata;
  its geometry output is stored — never regenerate from seed at load (ADR-21, ADR-23).
  Determinism also means the *tie-breaks* must be ordered: a biome vote that resolves ties by
  whichever count a `Map` reached first makes one seed produce two worlds.
- **Sample a region, not a point.** A landmass's biome comes from the fields under it, and the
  obvious sample point — the centroid of the outer ring — lies **outside** a crescent
  coastline. Measured across nine generated worlds it fell outside in five, every time on the
  largest continent, once colouring a 5.3-million-unit continent from open sea. Vote over
  points verified inside the polygon (`pointInPolygon`, even-odd, so a lake counts as
  outside).
- **Thresholds are relative to the terrain that exists,** never to the abstract 0..1 range.
  The world-type falloff scales the elevation field down, so "high ground" measured against
  1.0 can sit above every hill on the map and scatter nothing at all. Sea level is a
  **quantile** of the field — which is also what makes "land amount 0.45" mean 45% of the
  canvas whatever shape the noise took — and the ridge and tree lines are fractions of
  `seaLevel -> peak`.
