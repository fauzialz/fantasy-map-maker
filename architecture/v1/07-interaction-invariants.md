# Interaction Invariants & Debug Log — WP-6 / WP-7

_Written after the selection/transform debugging pass. **Read this before touching the
sprite renderer, object bounds, selection, or any pointer interaction.**_

Seven bugs came out of one feature (multi-select with transform handles). Every one of
them lived in the seam between **what is drawn** and **what is clicked**, and only one was
visible to `tsc`, `oxlint` or the unit suite at the time. Five were found only by driving
real input at a real browser.

The invariants in §2 are the durable part. §3 is the evidence.

---

## 1. The verification gap — read this first

**What went wrong.** WP-7 was reported as "verified by render": a screenshot showed a
selection frame with handles around 22 mountains. But that screenshot was taken with the
selection *seeded* into the store. The overlay drew perfectly — while nothing in the app
could set a selection at all, because the call that wires a click to `selection.begin`
was missing. A screenshot of seeded state proves the renderer works. It says nothing
about the code that produces that state.

> **Rule: seeded state verifies rendering. Only driven input verifies interaction.**
> If a work package's acceptance says "click", "drag" or "select", a screenshot is not
> evidence.

**The same question, asked of pure logic: does the test fail when the code breaks?** Driven
input is the answer for interaction; for a pure module the sibling check is to break it on
purpose. The undo stack's suite was verified by seven deliberate mutations — reference
equality instead of value comparison, a flipped undo/redo direction, a dropped label check, a
removed history cap, untouched layers rebuilt — each expected to fail one specific test, and
each did. A suite that has never been observed failing is a suite of unknown value.

> **WP-17 is the case for actually doing it.** Its roughener had three mutations aimed at it;
> two failed a test immediately and the third — deleting the taper that blends the carved
> edge into the coast — passed cleanly, twice, for two *different* reasons. First the test
> asserted "the join moved by less than the amplitude", which permits exactly the step the
> taper exists to prevent. Tightened to "the join did not move", it still passed: simplex
> noise is exactly zero at every lattice point, and the fixture's run happened to start and
> end on integers, so both ends read zero with or without the taper. Then it *still* passed,
> because the fixture's cut coordinate collided with an existing vertex, leaving an unmoved
> original point sitting exactly on the join being measured.
>
> Three separate ways for a test to be blind, in one assertion. Each was invisible while it
> passed, and the second one was a real defect in the code as well — every cut had an
> accidental flat spot at its start. **Mutate the code; a green suite proves nothing on its
> own.**

**Why headless screenshots aren't enough.** `chrome --headless --screenshot
--virtual-time-budget=N` fast-forwards timers but never delivers a Web Worker's reply, so
any capture of worker-derived output (coastal rings) shows a pending state no matter how
large N is. Raising the budget produces a byte-identical image. Workers need real time.

**What to use instead: drive the app over CDP.** Node 20 has `WebSocket` behind a flag,
which is enough to talk to Chrome directly — no Playwright, no Puppeteer.

```sh
# 1. the app
npm run dev

# 2. a browser with the debug port open
chrome --headless --disable-gpu --remote-debugging-port=9223 \
       --user-data-dir=<temp> http://localhost:5173/maps/create

# 3. the driver
node --experimental-websocket drive.mjs
```

> **The URL changed with WP-30, and it changes for every driver at once.** Until then the recipe
> above ended in `http://localhost:5173/`, which was the editor. ADR-40 makes `/` the **landing
> page** — a static file with no canvas on it — so a driver pointed there finds no stage, no HUD
> and no tools, and fails in a way that looks like the app is broken. Target `/maps/create` to
> start clean, or `/maps/edit/{uuid}` to drive a specific map. Anything that navigates as part of
> the check should use `Page.navigate` rather than clicking through, unless the navigation *is*
> what is being tested.
>
> Two consequences of routing that a driver has to respect: **`Page.navigate` is a full reload, so
> the undo stack is gone** on the other side (history is session state, ADR-35) — assert on the
> scene or the record, not on undo depth, across one. And **a client-side navigation flushes
> autosave** (`14` §4.7), so a check measuring the flush must drive the *link*, not `Page.navigate`.

```js
// the whole recipe: find the page, open the socket, send CDP commands
const list = await (await fetch("http://127.0.0.1:9223/json/list")).json();
const ws = new WebSocket(list.find((t) => t.type === "page").webSocketDebuggerUrl);
// … id-matched request/response over ws.send / "message" …
await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseMoved",   x, y, buttons: 1 });
await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0 });
const hud = await send("Runtime.evaluate", { expression: `document.querySelector(".hud").textContent`, returnByValue: true });
```

Two things make this work well here:

- **Assert on what the UI reports, not on internals.** The HUD prints object and selection
  counts, so a driver can assert `"11 of 11 selected"` without the app exposing its store.
  Keep that HUD, or something like it.
- **And you could not read the store anyway.** `await import("/src/state/editorStore.ts")`
  from the console returns a **second module instance** with its own fresh zustand store, not
  the one the app is running. WP-14's driver had the HUD reporting 4 landmasses while the
  imported store reported 0. Pure functions imported that way are fine — WP-21's sprite
  measurements use `spriteExtent` and `rasterSprite` exactly so — but anything holding state
  is a different object graph. This makes "assert on the UI" a constraint, not a preference.
- **Make the surface unambiguous before asserting on it.** WP-14's driver swept for land by
  clicking and treating "1 selected" as a hit — but land is covered in trees, so it was
  selecting a tree, and every check downstream then tested an empty land selection. A
  `data-land-count` attribute on the rail made the question exact. If an assertion can be
  satisfied by the wrong thing, it is not yet an assertion.
- **A cursor sweep finds the edge of a box, not the thing's anchor.** WP-20's driver locates a
  scattered mountain by sweeping for `pointer`, then drags it and checks the old spot is
  clear. The point it finds is wherever the sweep first entered the sprite's box, so a
  displacement smaller than the box leaves that point still covered: 286 map units against a
  190-unit mountain passed one run and failed the next on identical code. **Move by more than
  the thing you are moving**, or the probe is measuring the sprite's size.

  > **WP-19 hit the same rule one layer up, where the measured thing was a *slip*.** Its
  > riskiest check asks whether objects dragged with a landmass ride the drag's **resolved**
  > delta or its requested one. Break the code and they ride the requested one — but the slip
  > between the two was 360 map units against a 1 060-unit continent, so the strays were
  > still standing on it and the containment probe reported everything fine. The mutation
  > passed. Overshooting the drag until the slip exceeded the landmass made it decisive.
  > **Whatever a probe measures containment against, the error has to be bigger than the
  > container.**
- **Count the app's own side effects, don't infer them.** "One ring derivation per drop" was
  first written as "the HUD never says *deriving rings* during the drag", which is an
  inference and can miss a fast derivation between two samples. Wrapping
  `Worker.prototype.postMessage` from the driver logs the `op` of every geometry request
  instead — and because the method is on the prototype, it catches the worker the app created
  long before the driver arrived. The exact answer for a whole drag and drop is two ops:
  `resolveDrop, deriveRings`. This is not the store-reading trap above; `postMessage` is a
  platform method, and there is only ever one of those.
- **A cursor probe outside the stage returns the previous answer, not no answer.** WP-20's
  driver reads `.mbf-stage` `style.cursor` at predicted map points. The stage is 1088 px wide
  and the map does not fit inside it, so points past its right edge never receive the
  `mouseMoved` at all — and `style.cursor` keeps whatever the *previous* probe set. A check
  that scaled a river 2× and probed its new mouth at map x 3900, some 120 px off the edge,
  reported a confident cursor value that belonged to the probe before it. It failed on
  correct code, which is the only reason it was caught; had it been the other way round it
  would have read as a pass forever. **Assert your probe is inside the element you are
  reading from**, or site the fixture so it cannot leave.
- **Let the driver discover geometry by probing the app's own cursors.** Sprite variants
  are random and each has its own extent, so a driver cannot predict where a handle is.
  Sweeping the pointer and reading `document.querySelector(".stage").style.cursor` finds
  the rotate knob (`url("data:…`), the frame interior (`move`) and the corners
  (`*-resize`) using the app's real hit-testing. This is also a free cross-check that the
  cursor and the gesture agree.

Both bugs #2 and #7 below were found by the driver on its first run against code that
looked finished.

---

## 2. Invariants

These are the rules the bugs violated. Breaking any one of them produces a defect that
type-checks, lints, passes unit tests, and feels broken in the hand.

### I1 — The renderer and the transforms must share a pivot
`rotateObjects` rotates each object's anchor about an origin **and** adds to its own
rotation. That is only a rigid-body rotation if the renderer spins the sprite about
**its anchor**. When `drawSprite` pivoted somewhere else, rotating swung sprites along an
arc. If you change the draw transform, change `rotateObjects` with it.

### I2 — Bounds describe the artwork, not the canvas it was authored on
The sprite grid is 100×100 with the baseline at y=88, but no sprite fills it. Measuring
the grid instead of the path put visible slack above every object and mis-centred the
ones whose art is off-centre. `spriteBounds` measures the path data (§4).

> **That layer arrived — WP-21 built it** (`10-hit-testing-precision.md`, ADR-30): the box
> narrows the candidates, the **silhouette** decides between them. Measured, the box was a
> loose stand-in — 53% ink for a mountain, 50% for a tree, **28% for the compass**. I2 still
> holds and the box still exists; it stopped being the last word. Labels stay box-picked on
> purpose.
>
> **And the box got more honest at the same time.** `spriteExtent` now measures the flattened
> path rather than every number in the string, so a `Q` control point no longer stretches the
> box to a place the ink cannot reach: mountain 2 tightened **27%**, trees 1 and 3 by 17% and
> 15%. The rest did not move, because their extremes were already on-curve — which is worth
> knowing, since it means the tighter boxes and the precise picking fix **different sprites**.
> The compass's box is eight straight lines and was always honest; what was wrong there was
> using it to pick.

### I3 — Bounds follow rotation
`objectBounds` returns the AABB of the *rotated* sprite. Skipping this makes the
selection frame and every hit test describe a sprite that is no longer there — the object
becomes progressively harder to click the further it is turned.

### I4 — Cursor rules mirror gesture rules
`cursorForHover` and `resolveGesture` resolve the same precedence. The pointer must
promise exactly what a press will do; the two drifting apart is precisely how bug #2
stayed invisible (hover said one thing, the press did another).

### I5 — Gesture precedence, and shift escapes it
**Control point → handles → frame interior → object → empty space.** **Shift skips every
one of those shortcuts**, because shift means "change the selection". Without that escape, a
shift-click on an already-selected object lands inside the frame and starts a drag, so it
can never be deselected.

> **The top rung arrived with WP-20**, and it is not a courtesy: a river's control point is
> always offset from the frame corner by exactly half its width, which at any ordinary river
> width is *inside* the 9 px handle reach. Without the rung, grabbing the end of a river
> scales the whole thing. Deleting it in the driver produced precisely that — the press
> became a corner scale, and the mouth moved along with the source.

### I6 — A drag transforms the snapshot, not the previous frame
Every transform runs against the objects as they were when the drag began, applying an
absolute delta. Incremental deltas accumulate drift, and a snapshot is what lets WP-9
turn a whole drag into exactly one undo step.

### I7 — A group's frame angle is session state, measured in its own basis
A single object's frame takes the object's own rotation. A group has no inherent angle,
so `useSelection` carries one that **resets whenever the selection set changes** — every
new selection starts upright. Measure the group's box by un-rotating its corners into the
frame's basis; taking an axis-aligned union instead makes the frame *breathe* as the
group turns (for a group wider than tall, the union gets **narrower** at 40°, not wider).

### I8 — Screen-constant UI divides by zoom, in both drawing and hit-testing
Handles are 9 screen px. [SelectionOverlay.tsx](../../src/canvas/SelectionOverlay.tsx)
and [handles.ts](../../src/canvas/handles.ts) each divide by the current scale, and must
keep using the same constants, or what you see stops matching what you can grab.
[RiverOverlay.tsx](../../src/canvas/RiverOverlay.tsx) draws a river's control points at
`HANDLE_PX` and [useSelection.ts](../../src/canvas/useSelection.ts) grabs them at the same
radius, for the same reason — **it also decides picking**, since `riverAt` passes that radius
to `isOnRiver` as slack so a thin river stays clickable when zoomed out.

### I9 — One predicate decides what is interactive: `hasFootprint`
_Added by WP-8._ Selection, the rbush index, the selection frame, the eraser and the
transforms all ask [bounds.ts](../../src/scene/bounds.ts) the same question: does this
object have an anchor and a drawn box? Answer **yes** and it is selectable, movable,
scalable, rotatable and erasable with no further work — that is how icons and labels
arrived complete, by widening one type and one function rather than by adding tools.
Answer **no** (landmass, river) and the object is path-based and **must** bring its own
tool; handing it a footprint instead would hang scale handles off geometry that
`translateObjects` deliberately refuses to move, so the frame would promise a drag that
silently does nothing. When adding an object type, the first question is which side of
this predicate it falls on.

> **Rewritten, and now true of the code — WP-15 landed it.** `08-terrain-as-objects.md` §7
> replaces I9 with a two-model version, and decision **D1** settled it yes (ADR-28). The
> precondition was always "once the transforms behind those handles actually move geometry";
> WP-15 is where that became true, so the replacement text now governs:
>
> > **I9 — Two interaction models, and which one an object belongs to.**
> > Objects with an anchor and a drawn box (`hasFootprint`: sprites, labels) are hit-tested by
> > their box, indexed in rbush by AABB, and transformed about their anchor. Path-based
> > objects have absolute geometry: they are hit-tested **by their path**, and transforms
> > **bake into their points**. Both models may present the same frame and handles — but only
> > once the transforms behind those handles actually move the geometry. A frame that promises
> > a drag the transform refuses is the defect this invariant exists to prevent. When adding an
> > object type, decide which model it uses before drawing anything.
>
> **Both path types are now on the second model** — landmasses since WP-15, rivers since
> WP-20. `transform.ts` no longer refuses anything: `isPath` and `remapPath` replaced the
> landmass-only pair, so translate and rotate are one branch for both, and scale is the same
> branch plus the one thing a river keeps *outside* its geometry, its `width`.
>
> **ADR-29 planned rivers as the pilot for this**, on the grounds that every transform is
> lossless on a river. That was true and it is still why WP-20 was cheap — but WP-15 was built
> first, so land, not rivers, is where the model got debugged. Rivers then cost about half of
> WP-15, exactly as `09` estimated.
>
> **Rules from `09-selection-across-layers.md`, all four shipped and all four now exercised
> across both models by WP-19:** the marquee is intersection for footprint objects and
> **containment for path objects** (WP-14 for land, WP-20 generalised it — `landmassBounds`
> became `pathBounds` over `worldCorners`, and the containment branch stopped naming a type);
> **the box takes no press, including I5's frame-interior rung, with the cursor resolving the
> identical precedence** (WP-15 for land, WP-20 for rivers, reusing the same `frameInterior`
> flag rather than inventing a second one); **a river's control points outrank the frame's
> handles** (WP-20, now I5's top rung); and **a drag applies one resolved delta to the whole
> selection** — written in WP-15, because the moment land could be dragged
> `resolveTerrainDrop` had to decide what the rest of the drag did, and proved in WP-19, where
> a mountain riding the *requested* delta while its continent slides back is the defect the
> rule exists to prevent.
>
> **A fifth rule joins them, and it is the one that decides membership:** a footprint object
> belongs to the landmass its **anchor** stands on, never its box (`standingOn`, WP-19). The
> anchor is the feet (§4) and the same `y` the draw order sorts on, so what looks like it is
> standing on the land is what the double-click takes — while a box would hand a coastal
> mountain to whichever side its artwork happened to lean.

---

## 3. The bugs

| # | Symptom | Root cause | Guard |
|---|---|---|---|
| 1 | Nothing could ever be selected | `selection.begin(...)` was never called — a scripted edit silently matched nothing | driver: "click selects one object" |
| 2 | Shift-click could not *de*select | frame-interior branch ran before the hit-test and ignored shift (I5) | `lets shift reach an object inside the selection frame` |
| 3 | ne/sw corners showed the wrong cursor while dragging | the gesture collapsed to `"scale"`, discarding which corner; the drag cursor hardcoded one diagonal | `carries which handle started the drag` |
| 4 | Rotation swung the sprite instead of spinning it | `drawSprite` pivoted on the bitmap's bottom edge — ~26 map units *below* the feet, in transparent padding (I1) | `keeps the frame centred on the artwork as it rotates` |
| 5 | Selection box had slack above the object, and sat off-centre | bounds measured the 100×100 grid, not the path (I2) | `measures the artwork, not the grid it was drawn on`, `centres on the artwork, even when it sits off-centre on the grid` |
| 6 | Frame did not follow a rotated object | `objectBounds` ignored `rotation` (I3) | `under rotation` block in `transform.test.ts` |
| 7 | Group frame stayed upright when the group turned | multi-selection frame had no angle (I7) | `keeps its size when the group and the frame turn together` |

**Finding the fixes.** Bugs 1 and 2 landed together in `2a085ee` *"Fix: selection never
selected anything"* — worth reading, because its message records how the seeded-screenshot
verification hid bug 1 in the first place. Bugs 3–7 came out of the follow-up pass that
produced this document; `git log --follow src/scene/frame.ts` picks it up.

Bug 1 is the process lesson: **a scripted string replacement that matches nothing fails
silently.** The formatter had wrapped the target line across two, my search string had it
on one, and the edit did nothing. `tsc` stayed quiet because the binding was still used
elsewhere (the overlay and the HUD count). Use an editor that errors on a missed match;
after any wiring change, grep for the call you think you just added.

> **It happened again in WP-18**, the same way. A scripted edit moved the Erase button into
> the new mode group and a second scripted edit was supposed to delete the old one — but
> Prettier had reflowed that block between the two, so the removal matched nothing and said
> nothing. `tsc` and `oxlint` were clean; the app shipped **two Erase buttons**, and only a
> screenshot caught it. The rule has a corollary now: **after a scripted edit, count what you
> expected to change** — `grep -c 'data-tool="erase"'` would have said 2.

---

## 4. Sprite geometry reference

The authoring grid is 100×100; the baseline (where feet stand) is y=88. Content never
fills the grid, and is not always centred:

| variant | empty above content | content x-centre |
|---|---|---|
| mountain 0 | 14 | **38** |
| mountain 1 | 18 | 47 |
| mountain 2 | 22 | 49 |
| mountain 3 | 12 | 48 |
| tree 0 | 8 | 50 |
| tree 1 | 10 | 50 |
| tree 2 | 12 | 50 |
| tree 3 | 18 | 50 |

`spriteExtent` in [registry.ts](../../src/sprites/registry.ts) derives this from the path
string rather than the raster, for two reasons: bounds are unit-tested in Node where
there is no canvas, and a measurement taken from the artwork updates itself when the
artwork changes.

> **The warning that used to live here is now a guard — WP-21.** It read: *the paths use only
> absolute `M/L/Q/Z`, so if a sprite ever needs an arc or a relative command that parser must
> be revisited, or it will silently mis-measure.* A note in a document is weak protection for
> something that goes wrong months later at asset-swap time with "selection feels off" as its
> only symptom, and the unsupported set is precisely what a design tool exports by default.
>
> [path.ts](../../src/sprites/path.ts) is now a real command walker: an unsupported command
> **throws**, naming the letter and the path, and `path.test.ts` runs it over **every body,
> detail and highlight in the registry** — so the wrong dialect turns the suite red on paste
> rather than mis-measuring in silence. The same walker flattens curves, which is what stopped
> the old min/max-of-every-number from counting **Bézier control points** as ink; a quadratic
> never reaches its control point, and mountain 2's box was 27% too big because of it.
>
> It also produces the rings the silhouette hit-test ray-casts, so there is one parser rather
> than a `Path2D` cache beside it, and precise picking stays canvas-free like the bounds.
> Procedure and the conversion step: `HOW-TO-CHANGE-SPRITE-ART.md`.

An object's `x,y` anchors the **centre-line of the content at the baseline** — its feet.
That is the same `y` the draw order sorts on (data model §5), so what you see matches
what sorts.

---

## 5. Where this lives in the code

| Concern | File |
|---|---|
| Gesture precedence | [canvas/gesture.ts](../../src/canvas/gesture.ts) |
| Handle hit-testing, cursors | [canvas/handles.ts](../../src/canvas/handles.ts) |
| Oriented selection frame | [scene/frame.ts](../../src/scene/frame.ts) |
| Rotation-aware bounds | [scene/bounds.ts](../../src/scene/bounds.ts) |
| Multi-object transforms | [scene/transform.ts](../../src/scene/transform.ts) |
| Sprite extents, anchoring | [sprites/registry.ts](../../src/sprites/registry.ts), [sprites/raster.ts](../../src/sprites/raster.ts) |
| Interaction state | [canvas/useSelection.ts](../../src/canvas/useSelection.ts) |
| River spline, ribbon, hit-test | [engine/river.ts](../../src/engine/river.ts) |
| River drawing + point editing | [canvas/useRiverTool.ts](../../src/canvas/useRiverTool.ts) |
| Label measurement + drawing | [sprites/text.ts](../../src/sprites/text.ts) |
| Every mark on the map, screen **and** export | [canvas/draw.ts](../../src/canvas/draw.ts) |

The driver scripts used for these passes were scratchpad tooling and were not committed.
§1 has enough to rebuild one in about twenty lines, and WP-8 did exactly that: 15 checks
covering place / select / move / delete for icons and labels, and draw / commit / select /
reshape / delete for rivers, all asserted against the HUD.

WP-11's driver added a second kind of assertion worth reusing: **the artefact, not just the
UI's account of it.** Fourteen checks clicked format, scale and Export, read the toast, and
then went to the *downloaded files* — PNG header bytes for the real pixel dimensions, and
the JPG decoded back into a canvas to sample its corners for the flatten. `Browser.set
DownloadBehavior` with a `downloadPath` is what makes the file reachable; note that every
export writes the same filename, so the driver has to move each one aside before the next.
Reading back what shipped is how "exports are correct at each scale" stops being the app's
own word for it.

WP-12's driver is the other half of that lesson, and cost two false starts worth recording.
"Work survives a refresh" needs a real `Page.navigate`, and its first version asserted the
wrong thing: it clicked Re-roll and navigated immediately, which failed three runs running.
The cause was not the feature — a probe that polled IndexedDB without navigating showed the
write committing in **~20 ms** — but the navigation aborting a transaction that had already
started. **A driver that races the thing it measures tests the race.** The check became a
measurement (poll until the value reaches disk, assert the latency) plus an unhurried
refresh. The first version *did* earn its keep, though: it found a real bug on the way, an
unguarded `loadLatestScene().then` that StrictMode's second mount let apply after cleanup,
so the restored draft was written straight back and started the throttle.

**Closed by WP-13.** Undo/redo and the generator were shipped verified by hand, which this
document's own rule says is not evidence. WP-13's driver closes all three: 29 checks over the
toolbar Undo/Redo buttons *and* Ctrl+Z / Ctrl+Shift+Z, the generate confirm through both
Cancel and Replace, the inline label editor, layer lock, the theme switch and the export
dialog. Three techniques from it are worth keeping:

- **Subscribe to `Page.javascriptDialogOpening` and assert it never fires.** WP-13's whole
  claim is that the native prompt and confirm are gone; a listener that stays silent for the
  entire run is a stronger statement than any grep, because it also covers dialogs opened by
  code paths the driver did not think to name.
- **Assert undo *depth*, not object counts, when checking that an action is one step.** The
  generate check compared object counts and passed by coincidence — the generated world had
  the same 1 086 objects as the map it replaced. Undo depth is exact and cannot collide.
- **Never wait on a condition that is already true.** `until(objects > 50)` returned
  instantly because the canvas was already populated, so the driver measured the state it
  was meant to be replacing and then blamed undo. Wait for the *completion* signal — here
  the "Generated N landmasses" toast. This is the same failure WP-12's driver hit from the
  other direction; between them the rule is: **a driver that races the thing it measures
  tests the race.**

WP-18's driver added two more, both about **not letting the driver assume what it is meant to
prove**:

- **Prove membership from a number the UI already shows.** "The selection spans four layers"
  cannot be asserted from a selection count. Deleting it and reading the **layer panel's
  per-layer counts** shows exactly which layers shrank — and the undo puts them back, so the
  probe costs nothing. A first draft had a `check(..., true, "verified below")`, which is a
  test that cannot fail.
- **Don't pick a target by guessing a pixel.** Clicking where a label was drawn selected a
  tree instead, because `SpatialIndex.hit` returns the topmost and a tree was over it. Hiding
  the other layers — using the feature under test — made the pick exact. Related: with a large
  selection, a click *inside the frame* is a move, not a pick (I5), so a driver reaching for
  one object must clear the selection first. Neither is a bug; both look like one from a
  failing assertion.
