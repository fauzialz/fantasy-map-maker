# Tools that say what they do

**Batch 6.** Design document for **WP-24 … WP-27**. Decision: **ADR-37** (WP-26 only).
**Prerequisite:** none. Every package here ships alone, and none of them blocks Batch 5.

Four complaints with one shape: a tool's behaviour and what the UI says about it have drifted
apart. A brush shows nothing until you commit to a drag. "Erase" means two different things
depending on which layer is live, and cannot touch two of the five object types at all. Select
exists twice, because ADR-28 made it global and nothing swept up behind it. Scatter rotation is
a constant pretending to be a decision. And a selected coastline is outlined in a colour that
was picked against a background that has since become theme-dependent.

**Build order is WP-24 → WP-25 → WP-26 → WP-27**, which is also numeric. It is not appeal
order: WP-25 and WP-26 both edit `LAYER_TOOLS`, and doing the smaller one first leaves the
larger one a cleaner table to change.

---

## 1. WP-24 · The brush ring follows the cursor

### The problem

Nothing tells you how big the brush is until you have already used it. The terrain brush draws
a preview stroke, but only once `previewPoints` has points — that is, once a drag is under way
([MapStage.tsx:342](../../src/canvas/MapStage.tsx#L342)). The object layers draw no ring at
all, ever. So the only way to learn what `brush size 240` means on this canvas at this zoom is
to make an edit and undo it.

The slider reads in **map units**, and the canvas is 4000 px wide at fit zoom on a laptop
screen. There is no way to convert one to the other by looking.

### The change

Draw a ring at the hover point whenever a **brush-shaped** tool is in hand:

| Tool | Ring | Why |
|---|---|---|
| terrain brush | yes | paints a disc of `brushSize` |
| sea brush | yes, reading as water | subtracts a disc of `brushSize` |
| scatter | yes | jitters within `brushSize / 2` ([useObjectBrush.ts:72](../../src/canvas/useObjectBrush.ts#L72)) |
| erase | yes, reading as removal | tests a disc of `brushSize / 2` |
| place | **no** | one object at a click; there is no radius to show |
| select | **no** | the pointer is the hit shape, and I4 already governs its cursor |

**The hover point already exists.** `MapStage` tracks it on every `onMouseMove` and clears it
on `onMouseLeave` for the x/y HUD readout
([MapStage.tsx:373-378](../../src/canvas/MapStage.tsx#L373-L378)). This package adds a circle,
not a tracking mechanism.

Radius is map-space `brushSize / 2`, so the ring grows and shrinks with zoom exactly as the
affected area does. The **stroke** is screen-constant (`/ scale`), like every other piece of
selection chrome — invariant **I8**, so the ring neither vanishes at fit zoom nor thickens into
a band up close.

The sea brush and eraser rings read differently from the paint ring, extending the rule the
preview stroke already follows — *erasing reads as erasing*
([MapStage.tsx:346](../../src/canvas/MapStage.tsx#L346)).

### Acceptance

- Moving the pointer over the stage **without pressing** shows a ring for each of the four
  brush tools, and none for place or select — driven pointer movement, not a screenshot of a
  seeded cursor.
- Dragging the brush-size slider changes the ring's drawn radius while the pointer is still.
- The ring's stroke width on screen is the same at fit zoom and at 400 %.
- The ring disappears on `mouseleave` and does not survive a tool switch to place or select.

---

## 2. WP-25 · One Select, everywhere

### The problem

ADR-28 made Select a global mode in the toolbar, acting on every visible, unlocked layer. The
per-layer copies were never removed: `LAYER_TOOLS` still lists `"select"` on all five object
layers ([editorStore.ts:33-39](../../src/state/editorStore.ts#L33-L39)), so the left rail
renders a second Select chip — and on rivers a third name for it, `Edit`
([ToolOptions.tsx:28](../../src/ui/ToolOptions.tsx#L28)).

Two controls for one mode, and the rail's copy looks layer-scoped, which is precisely the
mental model ADR-28 removed.

### The change

`LAYER_TOOLS` loses `"select"` and nothing else:

```ts
mountains: ["scatter", "place", "erase"],
forests:   ["scatter", "place", "erase"],
icons:     ["place", "erase"],
labels:    ["place"],
rivers:    ["place"],
```

**`"erase"` stays here until WP-26 lands**, and not out of caution: the rail's Erase chip is
currently the *only* way to erase objects, so removing it before the global eraser exists would
leave a release with no object eraser at all. WP-26 removes it in the same commit that makes the
global one real.

`RIVER_TOOL_LABEL`'s `select → "Edit"` entry goes with it; `place → "Draw"` stays. Reshaping a
river happens through global Select, which is what ADR-29 already specifies and WP-20 already
built — dragging a control point outranks the frame's handles there.

**Smaller than it looks.** `setActiveLayer` already treats select as living outside the table
(`state.objectTool === "select" || !tools || tools.includes(...)`,
[editorStore.ts:194](../../src/state/editorStore.ts#L194)), so the global mode keeps surviving a
layer switch with no change. `Toolbar`'s `pickLayer` / `leaveSelect` are likewise unaffected —
they already exist to get *out* of select when a create tool is picked.

### Rides along: the selected coastline gets honest contrast

`BIOME_FILL` is refreshed from CSS custom properties whenever the theme flips
([palette.ts:112](../../src/canvas/palette.ts#L112)), so land is a different colour in dark
mode. The selection outline is a hardcoded `#22685B`
([TerrainSelectionOverlay.tsx:5](../../src/canvas/TerrainSelectionOverlay.tsx#L5)). The
background moves and the outline does not, which is why a selected landmass can be hard to
pick out.

**The fix is background-independent rather than a better single colour.** Stroke the coastline
twice: a wider contrasting halo underneath, a narrower accent core on top — the standard trick
for chrome that must survive any fill under it, and the reason marching ants are two-tone. Both
strokes stay screen-constant (I8). Roughly four lines in the same `sceneFunc`, and it stops the
question "which colour works on grassland *and* snow *and* dark-mode desert" from having to
have an answer.

It rides in this package because it is the same complaint — *selection does not read clearly* —
and touching one selection file twice in a batch is worse than touching it once.

### Acceptance

- The left rail shows no Select chip on any layer; the toolbar's Select still selects across
  layers, and still survives a layer switch. **Erase is still there** — it leaves with WP-26.
- On the rivers layer the rail offers **Draw** only, and a river's points are still draggable
  under global Select — driven input, since this is the interaction the removed chip used to
  reach.
- A selected landmass is legible against grassland, snow and desert, in **both** themes —
  the theme toggle is part of the check, because the theme is what the old colour ignored.

---

## 3. WP-26 · Erase is its own tool; the sea brush is terrain geometry

**This package changes decided behaviour. See ADR-37.**

### What Erase is today

ADR-18 made the eraser contextual: it removes whatever the active tool creates. In practice
that is two different tools sharing one button, and ADR-28 chose to **relabel** rather than
split it, so on Terrain it reads "Sea brush".

- **On Terrain** — subtracts a disc from the land geometry; can cut a landmass in two.
- **On an object layer** — removes objects **of that layer only**
  ([useObjectBrush.ts:79-97](../../src/canvas/useObjectBrush.ts#L79-L97)), and
  `isUnderBrush` returns `false` for anything without a footprint
  ([objectHit.ts:12](../../src/canvas/objectHit.ts#L12)) — so **landmasses and rivers cannot be
  erased at all**, by any tool, at any time.

That last line is the real defect. Every other operation in the editor became cross-layer at
ADR-28; the eraser stayed scoped, and its scope silently excludes the two path types.

### The change: two tools, not one tool with two costumes

**Sea brush** — unchanged. Terrain-only, subtracts geometry, can cut a landmass in two. It
stays where it is and keeps its name.

**Erase** — a global object eraser, a peer of Select. A drag removes **every object the brush
disc overlaps, on every visible, unlocked layer**. Layer lock is how you protect a layer, which
is exactly the scoping mechanism ADR-28 already gave Select — one mechanism, now governing both
global tools.

**A landmass the eraser touches dies whole.** Partial removal is the sea brush's job. Two tools
that both nibble at a coastline would be one tool wearing two hats, which is the situation this
package exists to end. The destructive case is covered: one drag is already one undo step
([useObjectBrush.ts:145-153](../../src/canvas/useObjectBrush.ts#L145-L153)), so an
over-enthusiastic sweep comes back with Ctrl+Z.

### What it needs

`isUnderBrush` grows two path branches. Both have their machinery already:

- **Landmass** — inside, or within the radius of the coast. `landmassAt`
  ([bounds.ts:214](../../src/scene/bounds.ts#L214)) answers the first, point-in-polygon with
  holes. The second needs a point-to-ring distance, which is `distanceToRiver`'s loop over
  `distanceToSegment` ([river.ts:53](../../src/engine/river.ts#L53)) with a ring instead of a
  centreline — export the private helper rather than writing a second copy.
- **River** — `isOnRiver(river, point, radius)` already exists
  ([river.ts:81](../../src/engine/river.ts#L81)) and already takes slack.

`eraseAt` walks every live layer instead of `activeLayerId`, and files one step across all of
them — the same shape `deleteSelection` uses for a cross-layer delete.

**And `LAYER_TOOLS` loses `"erase"`, finishing what WP-25 started.** Once Erase is global it is
the same duplication Select was: a rail chip that looks layer-scoped for a tool that is not.
The table ends at create modes only — `mountains/forests: ["scatter","place"]`,
`icons/labels/rivers: ["place"]` — which is the state WP-25 deliberately stopped short of,
because until this package the rail's chip was the only object eraser there was.

### Decisions — all three settled

- **D1 — do rivers die to the eraser too? → Yes.** Any object, whole, on any live layer. A river
  the brush crosses is deleted entire, the same rule as a landmass: partial removal of a path
  object is a reshape, and reshaping is Select's job.
- **D2 — where does Erase sit in the toolbar? → Beside Select, in the mode group.** It is now
  equally global, so it is a peer of Select rather than of the six layers. The alternative — a
  seventh chip in the create row — is the eight-peers flattening ADR-28 removed.
- **D3 — does hidden protect as well as locked? → Yes, and for *every* layer, not just terrain.**
  ADR-28's rule is *visible and unlocked*, applied without exception: a hidden layer contributes
  nothing to a click, a marquee, or now an eraser stroke. **Hiding a layer is a way to protect
  it**, which is a second meaning for visibility and is worth saying out loud — it is the reason
  a stroke can sweep the whole map and take only what you left showing.

### Acceptance

- A driven drag that crosses a landmass deletes **the whole landmass**, and one undo brings it
  back — driven input, since the whole package is a drag.
- The same drag over a **locked** terrain layer leaves it untouched, and over a **hidden** one
  too (per D3).
- One drag across mountains, a river and a landmass removes all three as **one** undo step.
- The left rail offers **no Erase chip** on any layer, and the toolbar's Erase still erases on a
  layer that is not active — the check that says the chip's removal cost nothing.
- The sea brush still subtracts a disc and still cuts a landmass in two — unchanged behaviour,
  checked because this package is where it would break.
- **A mutation proving the lock check discriminates**: with the lock test removed, the
  locked-layer check must fail. `07` §1's rule — a check that cannot fail is not a check.

---

## 4. WP-27 · Scatter rotation is a knob, not a constant

`anchorAt` hardcodes the jitter:

```ts
rotation: scatter ? jitter(5) : 0,
```

([useObjectBrush.ts:25](../../src/canvas/useObjectBrush.ts#L25)) — ±5°, chosen once so a range
would not look stamped, and never exposed.

**The change:** replace the `5` with session state `scatterRotation`, in degrees, surfaced as a
slider in the scatter tool options, **defaulting to 0** — every sprite upright until asked
otherwise. This deliberately changes the current feel, which is the point: an upright default is
what "no rotation" should mean, and a stylised map often wants exactly that.

The value is jitter *spread*, not an angle: `rotation: jitter(scatterRotation)`, so 0 means
upright, 15 means ±15°, and the slider's top end is whatever still reads as cartography rather
than confetti — 45° is a reasonable cap and is a decision the slider bounds can carry without
an ADR.

**Open decision D4:** the generator's scatter runs its own jitter, and its comment claims it is
the "same jittered look the scatter brush gives by hand"
([scatter.ts:71](../../src/engine/generator/scatter.ts#L71)). Either it reads the same knob — in
which case a generated world's rotation follows the current scatter setting, and the world code
(`11` §5.3) has one more field — or it keeps its own constant and **that comment stops being
true and must be rewritten**. Not left to the implementer: it changes what a world code
reproduces.

### Acceptance

- With the slider at 0, every scattered object has `rotation === 0` — read the **scene**, not
  the render.
- With the slider at 30, scattered rotations fall within ±30 and are not all equal.
- The slider appears only for the scatter tool, alongside brush size.
- Whatever D4 decides, the `scatter.ts` comment matches the code afterwards.

---

## 5. Not in this batch

- **Rotating an existing selection** by a numeric field. The transform frame's stalk already
  rotates a selection (WP-15, WP-20); this batch only sets what a *new* scattered object gets.
- **Per-object-type rotation defaults.** One knob until someone wants two.
- **An eraser that partially removes a landmass.** That is the sea brush, and the whole point of
  WP-26 is that they stop being the same tool.
