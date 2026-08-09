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

**Change: 190 → 100.** One constant. This section proposed 142 (190 × 0.75); judged against a
generated world that was still too big, and the value was set by eye at **100** — a little over
half. The ratio was an estimate, the map is the authority, and "mountains are too big" is
answered by looking rather than by arithmetic.

**Open decision D5 — where the shrink applies.** `SPRITE_HEIGHT` is the base height for the
*kind*, and the drawn size is `SPRITE_HEIGHT × object.scale`. So changing it re-renders **every**
mountain, on every saved map, at the new size. The alternative is leaving the constant alone and
scaling only at placement, in `anchorAt` ([useObjectBrush.ts:20](../../src/canvas/useObjectBrush.ts#L20)),
which shrinks new mountains and leaves existing ones.

**D5 — settled: change the constant.** "Mountains are too big" is a statement about the art, not
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
change — **`clampPan` handled it at the time**: it centred the map on any axis where the scaled map
is smaller than the view ([viewport.ts:46-47](../../src/canvas/viewport.ts#L46-L47)), a branch
that exists for narrow viewports and now does the letterboxing for free.

> **Superseded in part by ADR-42 (WP-36).** That centring branch is gone: it was a *framing*
> decision living inside a clamp, and it meant zooming out to inspect a coast threw away the
> framing you pulled back to see. Panning now has a bound of its own — half of whichever is
> smaller, the map or the viewport — and an explicit `centred()` does the fitting. The
> letterboxing this section relied on still happens; it is simply no longer a side effect.


**Still bounded.** ADR-02 rejected *infinite* zoom for unbounded memory and export; a floor at
half of fit is a wider bound, not the absence of one. See **ADR-38**.

**Nothing downstream needs changing.** `visibleRect` will report a rect larger than the map, and
`padRect` already clips to the map on both axes ([viewport.ts:77-88](../../src/canvas/viewport.ts#L77-L88)),
so layer cache rects stay map-sized and ADR-19's memory budget is untouched. The parchment and
vignette draw the canvas rect, so the area outside it shows the app background — which is the
point: the canvas gains a visible edge.

### Acceptance

- A generated world's peaks measure **a little over half** their previous height against the same
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

**Reshape, and it costs nothing extra.** A river whose mouth sits exactly on the coastline still
ends in a flat cap cut across the flow, which is why "snap the point" alone does not fix the
picture. The mouth has to *open along the shore*.

It does, for free, because of how the ribbon is already built. `riverCentreline` is
`chaikin(points, 2, false)` and **pins the last points the user placed**
([river.ts:16](../../src/engine/river.ts#L16)), and the end cap's direction is the tangent of the
last two centreline points ([river.ts:36-43](../../src/engine/river.ts#L36-L43)). So if the snap
writes the final control points **along the local coast normal** — one short approach point
inland, the mouth point pushed seaward past the coast stroke and the first ring band — the tail
runs perpendicular to the shore and the cap comes out **parallel to the coast tangent**. The
mouth opens along the shore, and the overshoot buries the seam.

**The reshape is therefore just control points.** No new geometry, no polygon boolean, nothing
added to the scene contract, and the result stays editable: the baked tail is two ordinary
points the user can drag afterwards like any other.

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

**What the straight cap does not do**, stated so nobody discovers it later: it matches the coast
*tangent*, not the coast *arc*. On a sharply curved bay the mouth edge is a chord across the
curve rather than a copy of it. The upgrade is clipping the ribbon against the land polygon —
which is a genuine polygon boolean, and would mean either storing the trimmed outline (a
`schemaVersion` bump to hold geometry that is otherwise derived) or re-deriving it at draw time
against the current terrain (a live cross-object dependency, which §2's D8 rejects, and which
would make every terrain edit invalidate the rivers cache — see DEBT Q-01). Ships as the straight
cap, with a `ponytail:` comment naming the ceiling and the clip as the way out.

> **The ceiling was lifted straight afterwards — see ADR-41 and WP-34.** The straight cap read
> as a spike stuck through the shoreline once it was actually looked at, and clipping the ribbon
> against the land turned out to cost one boolean against a dependency the project already
> accepts for coastal rings. The clip also settles **D6** by construction: a mouth that crosses
> the coast has its round cap cut off, one that reaches nothing keeps it.

### The other target: rivers

The same snap points at another river, and **the reshape half is already done** — by a decision
taken in WP-8 and written on the drawing function:

> *"A river is a filled ribbon rather than a stroked line… Flat, opaque and unstroked, so two
> overlapping ribbons paint the same colour twice and **a confluence is seamless**."*
> — [draw.ts:96-98](../../src/canvas/draw.ts#L96-L98)

Two ribbons of `PALETTE.river` that overlap merge into one shape with no seam to hide, because
there is no bank stroke to interrupt. So a tributary needs **no end reshaping at all**: it needs
its endpoint to land *inside* the trunk rather than near it, and the existing fill does the join.

That makes the river target the cheap half of this package: snap to the nearest point on the
trunk's centreline via `distanceToRiver` ([river.ts:68](../../src/engine/river.ts#L68)), then
overshoot **past the trunk's centreline by half the trunk's local width**, so the tributary's cap
is buried under the trunk's ribbon instead of poking out of its far bank.

**It is not a join, and nothing in the model says it is.** Two rivers that meet are two objects
that overlap. Neither references the other; deleting the trunk leaves the tributary ending in
open water, exactly as a deleted landmass leaves its river behind (D8).

### Decisions — all five settled

- **D6 — which end snaps? → The end being laid, whichever it is.** You draw source-to-sea, so
  the last point is normally the mouth; a river drawn the other way still wants its coastal end
  tidied, and nothing in the model knows which end is downstream anyway (see §2.1).
  **And an end that snaps to nothing is rounded.** A mouth that reaches neither a coast nor
  another river gets a **round cap** instead of the flat cut it has today, so a river that stops
  mid-map reads as fading out rather than being sliced off. Cheap and additive: `riverRibbon`
  closes its outline between the last left and right bank points, so a rounded end is an arc of
  a few points across that gap at the local half-width — no new data, no new pass.
  *(The source cap is the same three lines if it should be rounded too; nobody has asked, so it
  stays flat.)*
- **D7 — does a dragged endpoint re-snap under global Select? → Yes**, with the snap suppressed
  while a modifier is held, so a point can still be placed deliberately off a coast.
- **D8 — does a mouth survive a coastline edit? → No re-snapping.** A landmass moved or resized
  under WP-15 leaves its rivers where they are, and the user readjusts by hand. The snap is an
  aid at draw time, not a live constraint — a constraint would mean a river's geometry depends
  on another object's, which the scene model does not do. The baked tail is ordinary control
  points, so a stale mouth is a river you can drag, not a broken object.
  **D7 and D8 are consistent, not opposed:** a river re-snaps when *the river* is edited, and
  never when something *else* moves. The trigger is always the user's hand on that river.
- **D9 — coast or river when both are in range? → Nearest wins**, no type preference. "Coast
  beats river" would be unpredictable at the one place it ever fires — a tributary meeting a
  trunk near the shore.
- **D10 — can a river snap to itself? → No.** A self-snap turns a doubling-back river into a
  loop nobody asked for. One id comparison, and the river being drawn is excluded too.

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
- **The mouth opens along the shore, not across the flow**: a river meeting a coast at 45° ends
  with its cap parallel to the coast tangent, not perpendicular to its own last segment. Read the
  **stored points** — the last two lie on the coast normal — and confirm it in the picture.
- A tributary finished near another river ends **inside** it, and the two read as one shape with
  no seam — the existing unstroked fill, checked because this package is what makes it visible.
- Deleting the trunk leaves the tributary ending in open water, unmoved. Nothing references
  anything (D8).
- A river finished **away from** any coast or river ends in a **round cap**, not a flat one, and
  one that snapped does not — the two caps are visibly different at the same width (D6).
- Dragging a committed endpoint near a coast re-snaps it; holding the modifier drops it exactly
  where the pointer is (D7). Moving the *landmass* instead leaves the river untouched (D8) —
  both directions checked, since they are the pair most likely to be confused.
- A snapped river survives a save and reload with the same points: the snap resolves at draw
  time and stores plain geometry (D8), so there is nothing new in the scene contract — **no
  `schemaVersion` bump in this package**, and if one appears the design has gone wrong.

---

## 3. Not in this batch

- **Auto-generated rivers**, which the generator does not do and v1 defers.
- **Rivers that re-follow a moved coastline.** D8 says no on purpose; a live geometric
  relationship between two objects is a scene-model change, not a drawing aid.
- **Snapping anything else to anything else** — river-to-river confluences, labels to coasts.
  One snap until a second one is asked for.
- **Per-kind sprite scale in the UI.** WP-28 changes a constant; a size control for mountains as
  a class is a different feature and nobody has asked for it.
