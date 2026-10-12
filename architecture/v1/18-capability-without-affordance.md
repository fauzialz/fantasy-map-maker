# Capability without an affordance

_A **survey**, not a work order. Nothing here is decided and no package exists for any of it.
Five topics remain from a seven-topic UX read, re-audited against `main` at `fb63775` — Batches
1–14 built, every scheduled 0.5 package shipped, staging live since WP-39._

**Two topics were deleted outright and three narrowed**, because the work had already been done.
§3 records what died and which package killed it, so nobody raises them a third time.

---

## 1. Why this document is a re-audit

The first version of this survey was written against `b5846d9` without fetching, and `main` was
**ninety commits ahead** — Batches 5 through 15, ADR-36 … ADR-50. Two of its seven topics had
shipped, two more were half closed by work it had never read, and every file citation in it
pointed at a rewritten line. It proposed a landing page that already existed.

That is worth one paragraph rather than none, because it is the same failure `07` §1 keeps
recording in a different costume: **a claim about "what is true today" is only as good as the
moment it was taken, and nothing in a document announces its own staleness.** `07` §1 asks for
assertions against the live UI rather than a seeded snapshot; the equivalent for a design
document is to re-read the code at the commit you are writing against. The survivors below are
cited at `fb63775` and will rot the same way.

## 2. The shape the survivors share

The deleted topics were about **grouping** — controls filed by the order they were built in
rather than by what kind of thing they are. Batch 5 settled that with one rule (`11` §2), and
Batches 6, 12 and 13 applied it until the rails held one idea each.

What is left is a different shape, and it is sharper:

> **The editor is already capable of the thing. There is no way to ask for it.**

Four of the five are literally that. `centred()` exists and no control calls it (§5.2). The
shortcuts sheet is wired to read off the live handlers, and the handlers are six keys (§5.1).
The canvas knows how to be empty and never says what to do about it (§5.3). The stage has one
input device and the product has a public front door (§5.4). The fifth, §5.5, is the one
genuine piece of drift — and it has now happened twice in the same shape, which is what makes
it worth a row rather than a fix in passing.

None of these is a renderer defect, none needs a `schemaVersion` bump, and none is large. Their
difficulty is in deciding what the product owes, which is why this is a list of questions.

## 3. What died, and what killed it

Recorded so the closed ones stay closed. **Do not re-raise these from an older read.**

| Was | Status | Closed by |
|---|---|---|
| The right rail stacks five unrelated concerns and scrolls | **dead** | **WP-32** / ADR-36 — menu bar, rail cut to two sections, measured 814/814 with no scrollbar (`11` §3) |
| **Generate** exists twice | **dead** | **WP-32** — the rail's copy went; the dialog is the command (`11` §5.1) |
| There are two places to press Select | **dead** | **WP-25** — `LAYER_TOOLS` lost `"select"`; the rail's chip and rivers' third name `Edit` both gone (`12` §2) |
| Erase means two things and cannot touch land or rivers | **dead** | **WP-26** / ADR-37, then ADR-50 — Erase is a global object eraser; the sea brush is the water layer's **Sea** tab (`12` §3) |
| The tool rail shows controls the active tool cannot act on | **dead** | **WP-37** / ADR-43 — the rail follows the tool in your hand (`11` §3 note) |
| The brush gives no feedback until you commit to a drag | **dead** | **WP-24** — a ring at the hover point for every brush-shaped tool (`12` §1) |
| **There is no landing page** | **dead** | **WP-30 + WP-31** / ADR-40 — `/` is a static landing page, `/maps` the gallery, `/maps/create` the one screen where canvas size is free, `/maps/edit/{uuid}` the editor (`14`) |
| You cannot pull back far enough to see the canvas as an object | **dead** | **WP-28** / ADR-38 — the floor is `fitScale × MIN_FIT_FRACTION`, half of fit ([viewport.ts:41,46](../../src/canvas/viewport.ts#L41)) |
| Zooming out throws away your framing | **dead** | **WP-36** / ADR-42 — panning has a bound of its own and framing left the clamp (`13` §1.2 note) |
| The bottom autosave strip is a third status surface | **dead** | **WP-32** — `saved` moved into the menu bar (`11` §4); `data-autosave` lives there now |
| The app has one URL, so a map cannot be linked or bookmarked | **dead** | **WP-30** / ADR-40 |

Three of those — the landing page, the zoom floor, the pan bound — were raised in the stale
survey as open gaps. They had been designed, decided, built and driven before it was written.

## 4. Constraints — all inherited

| | Constraint | Source |
|---|---|---|
| **S1** | **No wall in front of creating, editing or exporting.** Free is everything that runs in the browser | ADR-07, ADR-31 |
| **S2** | **The scene contract is untouched.** Every topic here is chrome, view state or an input device. No `schemaVersion` bump, no `migrate()` step — if one appears, the topic has gone wrong | data model §7 |
| **S3** | **View state is never serialized** — zoom, pan, tool, selection. Anything §5.2 adds stays session state | data model §7 |
| **S4** | **A menu holds commands and set-and-forget settings; a rail holds live state you steer while looking at the map.** The test for anything new | `11` §2, ADR-36 |
| **S5** | **The pointer promises what the press does** — and an advertised key, a visible control and a stated affordance are all the same promise | I4, I9 |
| **S6** | **The shortcuts sheet is read off the live handlers.** A sheet listing something the app does not do is worse than no sheet | `11` §3 |
| **S7** | **Driven input is the evidence**, and every driver now targets a route | `07` §1, ADR-40 |
| **S8** | **Styling follows `06`**: Tailwind v4 `mbf:` prefix, class strings in `ui/variants.ts`, Radix primitives | ADR-24 |

---

## 5. The topics

### 5.1 The keymap, and the sheet that will police it

**Today.** `Help → Keyboard shortcuts…` opens a real sheet, built by WP-32. It has **nine rows**
([dialogs.tsx:88-98](../../src/ui/dialogs.tsx#L88)) — and **three of them are not keyboard
shortcuts**: `Shift + click`, `Double-click land` and `Scroll`. A sheet titled *Keyboard
shortcuts* is a third pointer gestures, which is not padding anyone chose; it is what honesty
produces when there are six keys to list. The menu bar renders `Ctrl+Z` and `Ctrl+Shift+Z`
beside their items through `menuShortcut()`, five uses in all.

The sheet is honest. It is honest because that is the entire keymap — `Space`
([MapStage.tsx:144](../../src/canvas/MapStage.tsx#L144)), `Escape` and `Delete`/`Backspace`
([useSelection.ts:535-536](../../src/canvas/useSelection.ts#L535)), `Enter`/`Escape` in the
spline tool and the label editor, and `Ctrl+Z` in `App`. **There are no tool keys, no
brush-size keys, no zoom keys, no select-all.** Six keys, and the sheet's other three rows are
there because the mouse had more to say than the keyboard did.

**What changed since this was first noticed, and it is the whole argument.** `11` §3 decided the
sheet is *read off the live handlers*, and S6 makes that a rule. That inverts the problem. The
old version of this topic needed a keymap *and* a surface to advertise it on, and the risk was
advertising a binding that did not fire — I4 in a new place. The surface now exists and is
already correct, so extending the keymap is **purely additive and self-documenting**: add a
binding, it appears in the sheet; forget to add it, the sheet is still not lying.

**The one piece of care left** is the guard, not the advertising. Three places listen on
`window` independently today — `App`, `useSelection`, `MapStage` — and only `App` bails on
`INPUT|TEXTAREA|SELECT`. A tool key bound to `t` that fires while the map-title input has focus
is the defect, and it is the reason W2 is a question rather than an implementation note.

**Open:** W1, W2.

### 5.2 `centred()` exists and nothing calls it

**Today.** This is the sharpest finding in the document, and it only became true *because* the
view work shipped.

ADR-42 separated framing from clamping on purpose: `clampPan` bounds the pan, and a distinct
`centred(scale, map, view)` ([viewport.ts:99](../../src/canvas/viewport.ts#L99)) frames the map.
WP-28 widened the zoom floor to half of fit so the canvas can be seen as an object with edges
(ADR-38). Both pieces of the thing a user wants are built, measured and decided.

**And `centred()` has exactly two callers, both in `MapStage`** — first measure
([:126](../../src/canvas/MapStage.tsx#L126)) and a canvas-size change
([:131](../../src/canvas/MapStage.tsx#L131)). Neither is reachable from the UI. Zoom is still
wheel-only ([:178](../../src/canvas/MapStage.tsx#L178)); pan is still middle-drag or space-drag
([:297](../../src/canvas/MapStage.tsx#L297)); and the HUD prints `zoom 62%` as text
([:692](../../src/canvas/MapStage.tsx#L692)) where a control belongs.

So a user who zooms into a coast and loses the map has no way back short of changing the canvas
size, **which empties the map**. That is the only remaining place in the editor where a user can
reach a state with no way out — everything else has undo.

**Why this is small.** A `Fit` affordance is one call to a function that exists, bounded by a
clamp that exists, at a floor that was decided. The cost is entirely in W3: *where does it go*,
and S4 does not settle it by itself — zoom is live state you steer at the map (rail), and it is
also a command with a keyboard shortcut (`View` menu). It may honestly be both, the way `11` §2
already licenses for Bring forward / Send back / Delete.

**Open:** W3, W4.

### 5.3 The canvas's first move

**Today.** Batch 8 gave the product a front door, and it does the explaining that the stale
survey complained was missing: `/` is a static landing page, `/how-it-works` is a real page
rather than an About box (`11` §3), and `/maps/create` is a screen you pass through on the way
to a new map. `/maps` has no separate empty state because the redirect *is* the empty state
(`14` §4.2). WP-24's brush ring answers "how big is 240" without an edit-and-undo.

**What is left is one surface: the canvas itself.** Arrive at `/maps/edit/{uuid}` on a blank map
— which is exactly where `/maps/create` sends you — and nothing on the canvas names the first
move. `grep -rniE 'empty state|first.?run|getting started'` over `src/` returns nothing but an
unrelated comment in `ribbon.ts`.

**This is narrower and better-posed than it was.** The question is no longer "the app explains
nothing", because it now explains a great deal before you arrive. It is: **does the blank canvas
owe a first line, given that the user has just been through a create screen that told them what
this is?** There is a real argument for no — the landing page and the create page have done the
work, and a hint on the canvas is a fourth place saying the same thing. There is a real argument
for yes — the create screen is about *canvas size*, not about *how to paint*, and the two ways to
start (the brush, and Generate) are in different places, one of which is a menu.

**And the repo now has a precedent for how to decide it.** `16` §10 established that a batch
whose decisions can only be judged by drawing maps **ends in an evaluation session, not a tick**
— and it survived contact, accepted after two sessions of use and fourteen corrections. "Does a
blank canvas need a first line" is that kind of question. It is not assertable; it is judged by
handing the editor to someone who has not seen it.

**Open:** W5, W6.

### 5.4 Touch, and the keyboard as an input rather than an accelerator

**Today.** The stage is mouse-only by construction. `grep -rnoE 'onPointer[A-Za-z]+|onTouch[A-Za-z]+'`
over `src/` returns **nothing** — the one `pointerdown` hit is a comment in `editorStore.ts`.
The stage takes `onMouseDown` with `e.button` tests, `window` `mousemove`/`mouseup`
([MapStage.tsx:297-332](../../src/canvas/MapStage.tsx#L297)), and a non-passive `wheel`
listener. There is no pinch-zoom and no two-finger pan. Separately, there is no keyboard path to
select or move an object at all: §5.1's bindings are accelerators for someone already holding a
mouse, not an alternative to being one.

**Why the stakes moved.** When this was first noted the app had one URL and no host, so it was a
theoretical absence. Two packages changed that: **WP-31** put a public landing page at `/`, and
**WP-39** made every merge to `main` ship to a live staging host. The product now has a front
door a phone can reach and an editor a phone cannot use — and ADR-04's whole reason for a
prerendered landing page is that it is *indexable*, which means found, which means arrived at
from a search on a device nobody chose.

**Neither is in `01` §15.** That section is the list of things deliberately deferred from v1,
and it has been maintained carefully — Batch 14 even struck first-class water bodies off it when
the deferral started costing something. Touch and keyboard-input are not on it, so right now
they are **absences rather than decisions**, which is the one state this repo's conventions say
should not persist.

**Declining either is completely legitimate.** A fantasy-map editor with a brush, a marquee and
transform handles has a real claim to being a pointer-and-keyboard tool, and ADR-02's bounded
canvas plus the 1–2k object budget were never sized for a phone. But the honest form of that is
an ADR with the rejected alternatives and a line in `01` §15 — not silence. The cheapest
intermediate worth naming: the **landing page is already static HTML**, so making `/` and
`/how-it-works` read well on a phone costs nothing and touches no editor code, while
`/maps/edit/{uuid}` says plainly that it wants a larger screen. That is a smaller promise than
a touch editor and a much larger one than a broken canvas.

**Open:** W7, W8, W9.

### 5.5 The feedback question, now two unequal halves

The three-surface complaint is **one-third dead**: WP-32 removed the bottom autosave strip and
moved `saved` into the menu bar (`11` §4). What is left is one decision and one piece of drift.

**The decision — the HUD is telemetry shown to end users.** It prints zoom, cursor, active
layer, **cache bytes in MB**, landmass count, ring count, object count, selection count, undo
depth, plus transient `vectorising…`, `rings frozen`, `deriving rings…` and errors
([MapStage.tsx:691](../../src/canvas/MapStage.tsx#L691)). `6 cached = 12.4 MB` is a number for
whoever is tuning ADR-19's cache strategy, and it sits permanently in the product's chrome.

This is not an accident — `07` §1 makes the HUD the surface every driver asserts against and
asks for it to be kept. But it has never been *decided*, and the cost of deciding it has gone
**up**: more drivers assert on it now than when it was first flagged, and S7 means every one of
them targets a route and reads this element. A split into a user status bar plus a debug HUD
behind a flag is a change to the assertion surface of every driven check in the repo. That is
the honest price, and it may well be the reason to keep it exactly as it is — in which case the
decision is "keep it, on purpose, and say why", which is an ADR and not a no-op.

**The drift — and it has now happened twice.** ADR-10 promises merge and split are reported with
an "undo-able toast so nothing feels lost". The paint path honours it; the drop path does not:

| Event | Toast | Undo action |
|---|---|---|
| paint bridges two landmasses | `useTerrainBrush` | **yes** |
| a dragged landmass is dropped on another | [useSelection.ts:361](../../src/canvas/useSelection.ts#L361) | **no** |
| two water bodies merge | [useSelection.ts:501](../../src/canvas/useSelection.ts#L501) | **no** |

The third row is new in Batch 14, and it is the finding. The first gap was an instance; a second
one written in the same shape, in the same file, by a later batch, is **a pattern propagating** —
which is exactly the condition `12`'s whole batch existed to catch, one layer down. Whatever
else is decided here, this one looks like a straightforward yes and is small enough to ride
along with any package that touches selection.

**Open:** W10, W11.

---

## 6. What this document does not cover

- **Anything P1–P3 owns**: the embed export, `.map.json`, accounts, cloud sync, share pages, the
  npm packages.
- **Vertex editing.** `17-vertex-editing.md` is on the 0.5 backlog awaiting an ideation session,
  with V2–V11 open. It is a *feature* with an unsettled shape; nothing here touches it, and §5.2's
  view controls do not block it.
- **Production deploy.** A public domain and the decision to point it at a release — tracked in
  WP-13's entry and `DEBT.md`. §5.4 raises the *stakes* of that deploy; it does not schedule it.
- **v1's deferred features** (`01` §15). Absence of a feature is not a UX gap — which is
  precisely why W7 and W8 ask whether touch belongs on that list.
- **The renderer, the geometry pipeline and `07`.** Nothing here proposes changing an invariant.
- **Debt.** None of this is debt by `DEBT.md`'s own test: undesigned work with no owner is not
  owed, it is unplanned. §5.5's toast gap is the one candidate, and it belongs to whichever
  package touches selection next — destination 2, not a row.

## 7. Decisions — every one is the owner's

None are settled. Listed with the trade-off rather than a recommendation, except where the
reasoning genuinely points one way. **Nothing becomes a package until its topic's decisions are
answered** (phase-0.5 work order, step 2).

| | Topic | Question |
|---|---|---|
| **W1** | 5.1 | What is the keymap? Candidates: single-letter tool keys, `[`/`]` for brush size, `Ctrl+A`, zoom keys. S6 means each one documents itself on arrival, so this can land incrementally rather than as a set |
| **W2** | 5.1 | One keymap module with one guarded listener, or bindings kept local to the hook that owns each gesture (as now, in three places, with one guard between them)? |
| **W3** | 5.2 | Where does **Fit** live — the `View` menu, a rail control, the HUD's zoom readout becoming a control, or more than one of those? `11` §2 explicitly licenses a command appearing in both a menu and a rail |
| **W4** | 5.2 | Do zoom in/out get visible controls too, or only a key and the wheel? Getting *lost* is the recoverable-state problem; zoom steps are convenience |
| **W5** | 5.3 | Does a blank canvas owe a first line, given `/` and `/maps/create` already explain the product? |
| **W6** | 5.3 | If yes — a canvas hint that clears on the first object, or a seeded example map? These are different products: one teaches, the other demonstrates |
| **W7** | 5.4 | **Touch: build a story, or decline it in an ADR and add it to `01` §15?** |
| **W8** | 5.4 | If declined — does the *landing page* still get a phone-readable pass, with the editor saying it wants a larger screen? It is static HTML and touches no editor code |
| **W9** | 5.4 | Keyboard as an **input** — select and move without a mouse. Same two honest answers as W7, and it is the accessibility half rather than the convenience half |
| **W10** | 5.5 | Does the HUD split into a user status bar and a debug HUD behind a flag — knowing that every driven check in the repo asserts against the current one — or is it kept deliberately, with an ADR saying so? |
| **W11** | 5.5 | Should the drop-merge and water-merge toasts carry undo, per ADR-10? (Looks like a plain yes; small enough to ride along with the next selection package) |

## 8. How this becomes work

1. **Settle one topic's decisions** — not all of them. Each topic is independent and any can go
   first.
2. **A design document** in this series (`19-…`) if the topic needs constraints and fixtures of
   its own; a small topic can be specified inline in its batch entry, the way Batch 11 was.
3. **An ADR per load-bearing decision**, with the rejected alternatives.
4. **Then** packages are appended to `prompts/phase-0.5-core-editor-improvement.md` as a new
   batch, numbered from the next free **WP**, with rows in `05-p0-build-checklist.md`.

**Two topics are judged rather than asserted**, and the repo has a precedent for both halves of
that. §5.3 (does a blank canvas owe a first line) and the visual half of §5.2 cannot be settled
by a driven check — `16` §10's evaluation session is the shape, and WP-28's "compared as two
screenshots at the same zoom, since this is a judgement about art" is the shape for the smaller
case. Everything else here is ordinary driven input under S7.

**One admissibility note, and it is smaller than it was.** Phase 0.5 admits a batch when it
"(a) changes the core editor, (b) is larger than a bug fix, (c) does not belong to P1–P3." All
five topics pass (a) — §5.4's landing-page half is the only part that does not, and ADR-40
already established that the static pages are this repo's to hold. The earlier version of this
survey raised a charter problem for a landing page that, it turned out, had already shipped
inside 0.5 as Batch 8.
