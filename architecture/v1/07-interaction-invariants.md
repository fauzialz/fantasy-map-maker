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
       --user-data-dir=<temp> http://localhost:5173/

# 3. the driver
node --experimental-websocket drive.mjs
```

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

### I3 — Bounds follow rotation
`objectBounds` returns the AABB of the *rotated* sprite. Skipping this makes the
selection frame and every hit test describe a sprite that is no longer there — the object
becomes progressively harder to click the further it is turned.

### I4 — Cursor rules mirror gesture rules
`cursorForHover` and `resolveGesture` resolve the same precedence. The pointer must
promise exactly what a press will do; the two drifting apart is precisely how bug #2
stayed invisible (hover said one thing, the press did another).

### I5 — Gesture precedence, and shift escapes it
Handles → frame interior → object → empty space. **Shift skips the handle and frame
shortcuts entirely**, because shift means "change the selection". Without that escape, a
shift-click on an already-selected object lands inside the frame and starts a drag, so it
can never be deselected.

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
[RiverOverlay.tsx](../../src/canvas/RiverOverlay.tsx) and
[useRiverTool.ts](../../src/canvas/useRiverTool.ts) share `HANDLE_PX` for the same reason.

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
artwork changes. It works because the paths use only absolute `M/L/Q/Z`, so every number
is a coordinate. **If a sprite ever needs an arc or a relative command, that parser must
be revisited** — it would silently mis-measure.

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

The driver scripts used for these passes were scratchpad tooling and were not committed.
§1 has enough to rebuild one in about twenty lines, and WP-8 did exactly that: 15 checks
covering place / select / move / delete for icons and labels, and draw / commit / select /
reshape / delete for rivers, all asserted against the HUD. Two details worth reusing —
`Page.javascriptDialogOpening` + `Page.handleJavaScriptDialog` drives the label's `prompt`
without stubbing it out, and the driver must `location.reload()` first or it inherits
whatever the last run left on the canvas. Still worth doing again for WP-10 (the generate
confirm flow) and WP-13.
