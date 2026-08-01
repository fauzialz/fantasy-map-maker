# The Drawn Shape Decides — Precise Hit-Testing and Honest Boxes

_Design document for **Batch 3** of `prompts/phase-0.5-core-editor-improvement.md`,
scheduled as **WP-21**. Decision recorded in **ADR-30**. Companion to
`HOW-TO-CHANGE-SPRITE-ART.md`, which is the authoring side of the same contract._

---

## 1. The concept

Every sprite is picked by its **bounding rectangle**. A mountain is a triangle, so roughly
half of that rectangle is empty sky — and clicking the empty sky selects the mountain.

This is the same complaint WP-20 answers for rivers, one step milder, and it comes from the
same place: **a box standing in for a shape.** WP-20 established the rule (S8: the box draws
the selection, the path picks it). This package applies it to the objects that have shapes
rather than paths, and fixes the two reasons the boxes are looser than they need to be.

## 2. Measured, not assumed

Ink inside the selection box, per variant. Measured through the app's own
`rasterSprite` and `spriteExtent` at OVERSAMPLE 2, counting pixels with alpha > 16 inside
the content extent:

| Sprite | Fill | Spread |
|---|---|---|
| **mountain** ×4 | **53%** | 51 – 56% |
| **tree** ×4 | **50%** | 46 – 53% |
| **landmark** ×8 | **61%** | **28 – 88%** |

The mean is the least interesting number. Broken out, the landmarks split in two:

- **castle 88%**, city 76%, ruin 73%, town 72%, tower 72% — near-rectangular buildings, boxes
  that are already honest.
- **compass 28%**, ship 39%, monster 39% — **worse than any mountain.** A compass rose is a
  four-armed star; everything between the arms is empty. At 28% it is in the same class as
  WP-20's diagonal river, and it is the strongest argument in this document.

**Labels are deliberately exempt.** `textBounds("Ardh Vale", 96)` is 517 × 91, and glyph
coverage inside that is low — but picking text by hitting an actual letter stroke would be
miserable, and the gaps between words are part of the thing you are pointing at. Labels keep
box picking. Writing that down here so nobody later "fixes" the inconsistency.

## 3. Why the boxes are loose — two causes, one of them free to fix

The shape being non-rectangular is unavoidable. The other two are not:

1. **Control points are counted as if they were on the curve.** `spriteExtent` takes the
   min/max of *every number in the path string*
   ([registry.ts:181](../../src/sprites/registry.ts#L181)), which includes the control point
   of every `Q`. A quadratic never reaches its control point, so the box is stretched to a
   place the ink cannot go. Flattening the curves instead tightens every box **for free and
   independently of hit-testing.**
2. **`STROKE_PAD = 1.3`** grid units on all four sides, to cover the 2.6-wide stroke. That
   one is correct — the stroke really is drawn there.

## 4. Constraints

| | Constraint | Source |
|---|---|---|
| **P1** | The box still exists and still matters: it is the drawn frame, the marquee target, and the rbush key. This package makes it *tighter and less authoritative*, never absent. | I2, ADR-16 |
| **P2** | A bigger target is easier to hit. At fit zoom a tree is a few pixels; demanding an exact silhouette hit would make an isolated sprite harder to select, not easier. | Fitts |
| **P3** | Hit-testing runs on **every mouse move** (`hover` sets the cursor). Whatever this costs, it costs continuously. | I4, [useSelection.ts](../../src/canvas/useSelection.ts) |
| **P4** | Bounds are unit-tested in Node, where there is no canvas. Anything that measures via `Path2D` cannot be the only path to a bound. | `07` §4 |
| **P5** | The marquee selects by box intersection and must keep doing so. "Marquee by silhouette" is neither meaningful nor affordable. | WP-7 |

## 5. What WP-21 changes

1. **Precise picking as a tie-break, not a filter.** rbush narrows by box exactly as now →
   among the candidates, prefer one whose **path** contains the point → if none does, fall
   back to today's topmost-by-Y. Precision arrives where boxes overlap, which is where "which
   one did I mean" is a real question, and P2 is preserved because an isolated sprite still
   answers to a near-miss.
2. **Labels opt out** (§2) and keep box picking.
3. **Tighter boxes by flattening.** Replace the number-scraping regex with a real command
   walk that flattens `Q` (and any curve) into sampled points before taking min/max. Keeps
   P4: it is still pure arithmetic over the path string, no canvas.
4. **The parser stops failing silently.** Today's regex is only correct while every number in
   the path is an absolute coordinate in x,y order. It mis-measures without a word on
   relative commands, arcs, and `H`/`V` shorthand — which is exactly what a design tool
   emits. A guard rejects an unsupported command outright, and a test over the registry runs
   it on every path. **This item is independent and can ship on its own, today**; it is the
   safety net `HOW-TO-CHANGE-SPRITE-ART.md` assumes.

- **Acceptance:** clicking inside a compass's box but outside its arms selects nothing, and
  clicking an arm selects it · with two overlapping mountains, clicking a point inside both
  boxes but inside only one silhouette picks that one · an isolated tree can still be
  selected by a click a pixel or two off its edge (P2) · a label is still selected by
  clicking the gap between two of its words · a marquee still selects by box · the flattened
  boxes are **measurably tighter** — re-run §2's measurement and record the new fill
  percentages beside the old · a path using a relative or arc command **fails a test** rather
  than mis-measuring · driven input, sweeping the pointer to read `.mbf-stage` cursors,
  because the cursor must agree with the new precedence (I4, `09` S9).

## 6. Decisions

| | Decision | Outcome |
|---|---|---|
| **F1** | Precise hit-testing for sprites? | **Yes, as a tie-break** (§5.1). Rejected full precision: at fit zoom it makes small isolated sprites fiddly for no gain, because ambiguity is the only thing precision actually resolves. |
| **F2** | Labels too? | **No.** The gaps between words are part of the target. |
| **F3** | Tighten the boxes as well? | **Yes** — control points are counted as ink today, which is a plain over-measure and free to fix while a real parser is being written anyway. |
| **F4** | Widen the accepted path dialect? | **Not in this package**, but §5.3's real parser makes it cheap afterwards. Arcs stay out regardless — flattening them is disproportionate when every design tool can emit curves instead. |
| **F5** | Guard the parser, or document the limitation? | **Guard it.** `07` §4 has documented it since WP-8 and a doc is weak protection for something that goes wrong months later at asset-swap time, silently, with "selection feels off" as the only symptom. |

## 7. Cost

| | Package | Size | Blocked on |
|---|---|---|---|
| **WP-21** | The drawn shape decides | ≈ half of WP-7 — a cached `Path2D` per variant, a tie-break in `SpatialIndex.hit`, a path walker replacing one regex | nothing. Item 4 can land alone first |

Composes with WP-20 rather than competing: both say *the drawn shape decides, not the box*.
Independent of WP-19 and of Batch 1.
