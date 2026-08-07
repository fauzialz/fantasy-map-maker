# Reading the map

**Batch 7.** Design document for **WP-28** and **WP-29**. Decisions: **ADR-38**, **ADR-39**.
**Prerequisite:** none. Both packages ship alone and neither blocks Batch 5 or Batch 6.

Three complaints about the finished picture rather than the tools that make it: mountains are
too big for the land they stand on, you cannot pull back far enough to see the canvas as a
whole, and a river stops dead at the shore instead of reaching the sea.

The first two are constants. The third is a real feature and carries the batch's risk.

---

## 1. WP-28 · The map at a glance

Two constants and one review pass. They land together because they are the same complaint —
*things are the wrong size on screen* — and because both are judged by looking, not by asserting.

### 1.1 Mountains at three-quarters

`SPRITE_HEIGHT.mountain` is **190** map units at scale 1
([registry.ts:135](../../src/sprites/registry.ts#L135)), against 84 for a tree and 165 for a
landmark. A peak reads as a landmark, which was the intent — it now reads as a landmark
standing on a continent two sizes too small for it.

**Change: 190 → 142** (190 × 0.75, rounded down). One constant.

**Open decision D5 — where the shrink applies.** `SPRITE_HEIGHT` is the base height for the
*kind*, and the drawn size is `SPRITE_HEIGHT × object.scale`. So changing it re-renders **every**
mountain, on every saved map, at the new size. The alternative is leaving the constant alone and
scaling only at placement, in `anchorAt` ([useObjectBrush.ts:20](../../src/canvas/useObjectBrush.ts#L20)),
which shrinks new mountains and leaves existing ones.

**Recommended: change the constant.** "Mountains are too big" is a statement about the art, not
about a default, and a per-placement scale would leave one map holding two mountain sizes with
nothing in the UI to explain it. Nothing is deployed yet (P1 and the deploy are paused), so no
saved map belongs to anyone but the author. Recorded as a decision because it is silently
retroactive, which is the kind of thing that should not be discovered later.

**What it does not break.** WP-21's precise-picking measurements are **ink percentages** — ratios
of drawn area to box area — so they are scale-invariant and stay valid. `spriteBounds` derives
from the same constant ([raster.ts:127](../../src/sprites/raster.ts#L127)), so boxes, hit-testing
and the rbush index all follow without being touched. The generator's scatter density is
per-area and does not read sprite height, so a generated world gets the same *number* of peaks,
drawn smaller.

### 1.2 Zoom out past the canvas edge

`fitScale` is both "the scale at which the map fits" and "the minimum zoom"
([viewport.ts:32](../../src/canvas/viewport.ts#L32)), so the furthest you can pull back is the
exact moment the canvas fills the viewport. You can never see the map as an object with edges —
which is what you want when judging composition, and what an export preview effectively is.

**Change:** the floor becomes a fraction of fit.

```ts
export const MIN_FIT_FRACTION = 0.5;   // the canvas may shrink to half of fit
```

`clampScale`'s minimum becomes `fitScale(map, view) * MIN_FIT_FRACTION`. That is the whole
change — **`clampPan` already handles it**: it centres the map on any axis where the scaled map
is smaller than the view ([viewport.ts:46-47](../../src/canvas/viewport.ts#L46-L47)), a branch
that exists for narrow viewports and now does the letterboxing for free.

**Still bounded.** ADR-02 rejected *infinite* zoom for unbounded memory and export; a floor at
half of fit is a wider bound, not the absence of one. See **ADR-38**.

**Nothing downstream needs changing.** `visibleRect` will report a rect larger than the map, and
`padRect` already clips to the map on both axes ([viewport.ts:77-88](../../src/canvas/viewport.ts#L77-L88)),
so layer cache rects stay map-sized and ADR-19's memory budget is untouched. The parchment and
vignette draw the canvas rect, so the area outside it shows the app background — which is the
point: the canvas gains a visible edge.

### Acceptance

- A generated world's peaks measure three-quarters of their previous height against the same
  coastline — compared as **two screenshots at the same zoom**, since this is a judgement about
  art and the assertion is visual.
- Clicking a mountain still selects that mountain, and the marquee still catches it: the boxes
  follow the constant, so **one driven picking check** at the new size guards the whole chain.
- Zooming out past fit shows the whole canvas with background around it, centred on both axes,
  and stops at half of fit.
- Panning while zoomed out below fit does not move the map — it is centred, and there is nothing
  to pan to.
- Zoom in still stops at `MAX_SCALE`, and `zoomAt` still keeps the point under the cursor fixed
  at both ends of the range.

---

## 2. WP-29 · Rivers meet the sea

### The problem

A river is drawn point by point and ends wherever the last click landed
([useRiverTool.ts](../../src/canvas/useRiverTool.ts)). Landing it exactly on a coastline by hand
is not possible at fit zoom, so every river either stops short of the shore — leaving a stub of
land between the water and the sea — or overshoots into open water with a blunt, visible end.
Rivers draw **above** terrain (ADR-15's fixed order), so neither failure hides itself.

### The change

Two parts, and they are separable — the snap is the interaction, the overshoot is the drawing.

**Snap.** While drawing, if the tip is within a **screen-space** threshold of a coastline, it
snaps to the nearest point on that coast. Screen-space, converted to map units at the current
scale, so the snap feels identical at fit zoom and at 400 % — the same rule I8 applies to every
other piece of chrome. Nearest-point is a loop over the landmass rings through
`distanceToSegment` ([river.ts:53](../../src/engine/river.ts#L53)) — the same helper WP-26
exports for the eraser, so whichever package lands first pays for it.

**The preview has to say so before the click.** A tip that will snap draws differently from one
that will not. Invariant **I4**: the pointer must agree with what the press will do, and a snap
that only reveals itself after the click is the same defect as a cursor that lies.

**Overshoot.** A river whose mouth sits exactly on the coastline still ends in a flat cap on the
shoreline. The snapped endpoint is pushed **seaward along the local coast normal** far enough
for the ribbon to cover the coast stroke and the first coastal ring band, so the mouth reads as
water meeting water rather than a pipe ending at a wall.

```
        before                    after
   ~~~~~~~~~~~~~~~~~         ~~~~~~~~~~~~~~~~~
   ~~~~ sea ~~~~~~~~         ~~~~ sea ~~~~~~~~
   ─────────────────         ────────╥────────   ← coast + first ring
   ▓▓▓▓▓▓▓█▓▓▓▓▓▓▓▓▓         ▓▓▓▓▓▓▓▓║▓▓▓▓▓▓▓▓
   ▓▓ land █ ▓▓▓▓▓▓▓         ▓▓ land ║ ▓▓▓▓▓▓▓
             ↑ stub                  ↑ mouth crosses the line
```

**The overshoot distance is a knob, not a derivation.** It has to look right against a coast
stroke whose width is screen-constant and a ring band whose gap is a user setting, so it ships
as a named constant with the number that looked right, and the design document says so rather
than pretending a formula chose it.

### Open decisions — settle before code

- **D6 — which end snaps?** The mouth is what the request named. The source arguably wants the
  opposite treatment (start *inside* the land, not on its edge). Recommended: **the end being
  laid snaps, whichever it is** — you draw source-to-sea, so the last point is the mouth, and a
  river drawn the other way still wants its coastal end tidied.
- **D7 — does an existing river's endpoint re-snap when dragged under global Select?** Consistent
  says yes, and it is the same code path. It also means a control point near a coast becomes
  hard to place *deliberately* off it. Recommended yes, with the snap suppressed while a
  modifier is held — the standard escape hatch.
- **D8 — does the overshoot survive a coastline edit?** A landmass moved or resized under WP-15
  leaves its rivers behind; a mouth that was snapped is then snapped to nothing. Recommended:
  **no re-snapping**, and say so — the snap is an aid at draw time, not a live constraint. A
  live constraint means a river's geometry depends on another object's, which is a relationship
  the scene model does not have and should not grow for this.

### Acceptance

- A river drawn with its last click **near** a coast ends **on** it — driven pointer input, and
  the assertion reads the stored points, not the picture.
- The same click far from any coast does not snap, and the tip preview differs between the two
  cases **before** the click — driven, sweeping the pointer, because the preview is half of what
  is being promised (`07` §1).
- The snap threshold in map units at 400 % is a quarter of what it is at 100 %: it is defined on
  screen, so a fixed map-unit threshold would fail this.
- The drawn mouth crosses the coast stroke and the first ring band, at ring gaps 4 and 60 — both
  ends of the slider, since the overshoot is a constant and the band is not.
- A snapped river survives a save and reload with the same points: the snap resolves at draw
  time and stores plain geometry (D8), so there is nothing new in the scene contract.

---

## 3. Not in this batch

- **Auto-generated rivers**, which the generator does not do and v1 defers.
- **Rivers that re-follow a moved coastline.** D8 says no on purpose; a live geometric
  relationship between two objects is a scene-model change, not a drawing aid.
- **Snapping anything else to anything else** — river-to-river confluences, labels to coasts.
  One snap until a second one is asked for.
- **Per-kind sprite scale in the UI.** WP-28 changes a constant; a size control for mountains as
  a class is a different feature and nobody has asked for it.
