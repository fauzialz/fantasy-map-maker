# Geometry Pipeline — Fixture Starter

Concrete, machine-checkable targets for the risky stages in `../04-geometry-pipeline.md`.
These make the acceptance criteria **executable** (pass/fail) instead of eyeballed.

## Why property assertions, not golden polygons

For geometry, a hand-authored *exact expected output* (specific vertices) is brittle:
the exact points depend on offset/rounding params, so a correct implementation would
fail a hand-drawn "expected." So each fixture ships **an input + a list of property
assertions** — the properties that define correctness and are robust to implementation
detail. Example: "no pinch at a strait" really means *the ring bands there form one
connected component with coverage ≤ 1 and never cover land*. That is what we assert.

## Fixture file shape

```jsonc
{
  "stage": "S14",                 // which pipeline stage this targets
  "case": "strait",
  "description": "…",
  "input": { /* parametric geometry the harness materializes — see below */ },
  "params": { /* ringGap, ringCount, coastDetail, SCALE, tessellation, … */ },
  "assertions": [ { "type": "...", /* args */ } ]   // ALL must hold
}
```

### Input primitives (the harness materializes these to polygons)
- `{ "type": "disc", "cx", "cy", "r" }` — tessellate to `params.tessellation` segments
  (default 64) for determinism.
- `{ "type": "polygon", "path": [[x,y],…], "holes": [[[x,y],…],…] }` — used directly.
- `{ "type": "landmass", "id", "name", "shape": <disc|polygon> }` — carries identity.
- `{ "type": "mask", "shapes": [<disc|polygon>…], "holes": [<disc|polygon>…] }` —
  rasterized to a bitmap for contour stages (S2).

All coordinates are **map-space**. Convert to scaled-int at the boolean/offset boundary
using `params.SCALE` (default 100), per the pipeline spec's precision rules.

## Assertion vocabulary (what the checker must implement)

Implement a small evaluator over these types (all use `polygon-clipping` for
union/intersection/difference and a shoelace area function):

| Assertion | Meaning / how to check |
|---|---|
| `componentCount(target, n)` | number of disjoint polygons in `target` == n |
| `holeCount(target, n)` | total interior rings across `target` == n |
| `polygonCount(n)` | result list length == n |
| `largestAreaHasId(id)` | among result objects, the max-area one has `.id == id` |
| `smallerPieceHasFreshId(notEqualTo, nameEmpty)` | the non-largest object(s) have a new id (`!= notEqualTo`) and, if `nameEmpty`, an empty name |
| `pointInside(target, [x,y], bool)` | point-in-polygon on `target` == bool |
| `noOverlapInBBox(bands, bbox)` | for the given bands, no two overlap inside bbox — i.e. `sum(area(band ∩ bbox)) == area(union(bands) ∩ bbox)` within `tol` (coverage multiplicity ≤ 1) |
| `singleComponentInBBox(bands, bbox)` | `union(bands) ∩ bbox` is one connected component |
| `landNeverCovered(bands, land)` | `area(union(bands) ∩ land) == 0` within `tol` |
| `areaMonotonic(seriesKey)` | a produced numeric series is strictly increasing |
| `areaAtLeast(target, minArea)` / `areaAtMost` | area threshold (speck filter etc.) |

**Never compare geometry with float `==`.** Always compare areas/points within
`tol = 1 / SCALE` (default `0.01`).

## Consuming these in the app repo

These live in the design repo as the **specification**. When building Phase 0, port each
fixture into the engine's test suite (e.g. `src/engine/__fixtures__/`), implement the
assertion evaluator once, and make each stage pass its fixtures **before** composing
stages. Replicate this input+assertion pattern for any stage not yet covered here (the
starter covers the highest-risk ones; extend to the full minimum set in the spec).

## Files in this starter
- `strait.fixture.json` — ⭐ the make-or-break rings test (S14).
- `s2-contours.fixture.json` — mask → contour component/hole counts (S2).
- `s7-union.fixture.json` — brush union: overlap→1, disjoint→2 (S7).
- `s9-split.fixture.json` — sea-cut splits, larger piece keeps id (S9).
- `s11-water.fixture.json` — water region includes lake + sea, excludes land (S11).
