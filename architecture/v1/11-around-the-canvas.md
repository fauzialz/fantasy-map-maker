# Around the Canvas — Seven UX Topics, None of Them the Renderer

_A **survey**, not a work order. Nothing in this document is decided, and no package exists
for any of it yet. It collects the UX gaps found in a read of the shipped editor after
WP-22, states what is true today with the evidence for it, and lists the decisions a human
has to take before any of it becomes work._

**How this becomes work:** §7. Each topic that survives a decision round becomes a batch in
`prompts/phase-0.5-core-editor-improvement.md`, with packages numbered from **WP-23** and
rows in `05-p0-build-checklist.md` — appended **then**, not now. A survey that schedules
itself is a plan pretending to be a finding.

---

## 1. Why these seven are one document

Four batches of post-P0 work (WP-14 … WP-22) went into the **mechanics of the canvas**:
terrain became an object, selection went global across two interaction models, picking became
silhouette-accurate, and drafts became a gallery. That work is done and it is good.

None of it touched the surfaces **around** the canvas. The result is an editor whose
interior is more finished than its edges — a map you cannot re-fit after you zoom past it, a
tool row with one advertised shortcut, and a first screen that says `saves as you work` to
someone who has not yet worked.

These are grouped because they share a shape: **each one is a gap between what the editor can
do and what a person can find out that it can do.** None is a renderer defect, none needs a
`schemaVersion` bump, and none of them is hard. Their difficulty is entirely in deciding what
the product should be, which is why this document is a list of questions.

## 2. Constraints — all inherited, none new

| | Constraint | Source |
|---|---|---|
| **U1** | **No wall in front of creating, editing or exporting.** Whatever any of this becomes, it cannot gate the editor. The free tier is *everything that runs in the browser* | ADR-07, ADR-31 |
| **U2** | **The scene JSON is untouched.** Every topic here is chrome, view state or a second surface. No `schemaVersion` bump, no `migrate()` step. If a topic starts needing one, it is the wrong topic | data model §7 |
| **U3** | **View state is never serialized** — zoom, pan, tool, selection. Anything §4.3 adds is session state, and it must stay that way | data model §7 |
| **U4** | **Styling follows `06-frontend-styling.md`**: Tailwind v4 `mbf:` prefix, `tailwind-variants` in `ui/variants.ts`, Radix primitives, tokens shared with the canvas | ADR-24 |
| **U5** | **The pointer promises what the press does**, and the same rule now applies to *any* affordance: a key that is advertised must work, a control that appears must act | I4, I9 |
| **U6** | **Driven input is the evidence.** Every topic here is click/drag/keypress by definition, so a screenshot proves nothing about any of it | `07` §1 |
| **U7** | **No backend, no network.** P2's business. A landing page that needs a server is the wrong landing page for now | phase-0.5 hard constraints |
| **U8** | **Deploy is frontend-only to the VPS behind Caddy**, not a generic static host — so a second route costs three lines of Caddy config rather than a host migration | ADR-34, `platform/README.md` D4 |

---

## 3. A note on where these came from

Read of the shipped code at `b5846d9`: `App.tsx`, `ui/Toolbar.tsx`, `ui/ToolOptions.tsx`,
`ui/MapPanel.tsx`, `canvas/MapStage.tsx`, `canvas/useSelection.ts`. Every claim below cites
the line it came from, so a reader can check whether it is still true rather than trusting
this document's age.

---

## 4. The topics

### 4.1 First contact

**Today.** The app boots to empty parchment. The only text is the autosave line at the bottom
of the window, which reads `saves as you work` ([App.tsx:29](../../src/App.tsx#L29)) before
the user has done any. There is no empty state on the canvas, no hint that terrain is
drag-to-paint, no pointer at Generate, and no indication that the toolbar's two groups mean
two different things.

**Why it matters.** `README.md` calls P0 "a complete portfolio piece" and P0's own definition
of done is written from the point of view of someone who already knows what the app is. The
first fifteen seconds are the least-designed part of the product, and for a portfolio piece
they are most of the product's actual audience.

**Candidate shapes**, cheapest first: a canvas empty-state that names the two ways to start
(paint, or Generate) and disappears on the first object · a dismissible first-run overlay ·
a scripted first-run that pre-seeds a small example map · a "load an example map" entry in
the gallery. These are not exclusive, and the first is nearly free.

**Interacts with:** §4.7 — if a landing page exists, some of this explaining happens there
instead, and the two must not say the same thing twice.

**Open:** G1, G2.

### 4.2 The keyboard

**Today.** The complete inventory of key handling in the app:

| Key | What | Where |
|---|---|---|
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z | undo, redo | [App.tsx:136-147](../../src/App.tsx#L136) |
| Escape | clear selection | [useSelection.ts:559](../../src/canvas/useSelection.ts#L559) |
| Delete, Backspace | delete selection | [useSelection.ts:560](../../src/canvas/useSelection.ts#L560) |
| Enter, Escape | finish / cancel a river | [useRiverTool.ts:89-99](../../src/canvas/useRiverTool.ts#L89) |
| Enter, Escape | commit / cancel a label | [LabelEditor.tsx:49](../../src/ui/LabelEditor.tsx#L49) |
| Space (hold) | pan | [MapStage.tsx:105](../../src/canvas/MapStage.tsx#L105) |

Six bindings, and exactly **one** of them is advertised anywhere in the UI — the undo
tooltip. There are no tool keys, no brush-size keys, no select-all, no zoom keys.

**Why it matters.** This is a tool-in-hand editor: the whole interaction model is "pick a
mode, then work the canvas". Every comparable tool binds its modes to single keys, and the
absence is felt within a minute of real use. It is also the cheapest topic here — the
bindings are a map, and the surface that has to change is a tooltip string per button.

**The trap.** U5 applies with force. A shortcut that is advertised and does not fire, or
fires while a text input has focus, is I4 in a new place. `App.tsx:140` already guards
`INPUT|TEXTAREA|SELECT` for undo; anything added has to inherit that guard rather than
re-derive it, and there are now three places that listen on `window` independently.

**Candidate shape.** One keymap module, one listener, one guard — with the toolbar reading
its hint text *from* the map so a binding cannot be advertised without existing. Plus a
shortcut sheet (`?`), which is also the discoverability answer.

**Open:** G3, G4.

### 4.3 Getting around the map

**Today.** Zoom is **wheel only** ([MapStage.tsx:116-129](../../src/canvas/MapStage.tsx#L116)).
Pan is middle-drag or space+left-drag ([MapStage.tsx:212-219](../../src/canvas/MapStage.tsx#L212)).
Neither is written anywhere in the UI. `fitScale` exists and runs on first measure and on a
canvas-preset change ([MapStage.tsx:96,101](../../src/canvas/MapStage.tsx#L96)) — but there is
**no way for a user to re-fit**, so zooming into a 4000×3000 map and losing the coastline is a
one-way trip short of changing the canvas preset, which empties the map.

The HUD prints `zoom 62%` as text ([MapStage.tsx:472](../../src/canvas/MapStage.tsx#L472)) —
a readout sitting exactly where a control belongs.

**Why it matters.** It is the only place in the editor where a user can get into a state they
cannot get out of. Everything else has undo.

**Candidate shape.** Zoom in / out / fit / 100% as a small cluster, keys to match (§4.2), and
the HUD's zoom readout becoming the control rather than sitting beside one. All of it is
view state (U3) and none of it touches the scene.

**Open:** G5.

### 4.4 Where controls live

**Today.** ADR-28 split the toolbar into **mode** (Select, Erase) and **create** (six layers),
because flattening two axes into one row is what made Select read as a broken sibling. That
fix stopped at the toolbar. One rail over, `ToolOptions` still renders `LAYER_TOOLS` as a
segment whose entries include `select` and `erase`
([ToolOptions.tsx:22-27,138-152](../../src/ui/ToolOptions.tsx#L138)) — so **there are two
places to press Select**, and they are the same axis collision ADR-28 diagnosed, moved into a
panel.

The same rail is also doing two unrelated jobs. It is titled `Tool options · terrain`
([ToolOptions.tsx:136](../../src/ui/ToolOptions.tsx#L136)) and it contains, beneath that
heading: brush size, coast detail, the biome palette, the selected landmass's **name**, the
overlap policy, icon kind, text size, river width — and then the whole selection inspector
(forward/back, delete, the selection hint) gated on `selecting`
([ToolOptions.tsx:347-400](../../src/ui/ToolOptions.tsx#L347)). "What my tool does" and "what
I have selected" are different questions and they are answered in one column under one
heading.

On the right, `MapPanel` renders five stacked sections unconditionally — Layers, Map settings,
Generator with its Advanced drawer, Map, Canvas
([MapPanel.tsx:47-284](../../src/ui/MapPanel.tsx#L47)). The generator occupies the middle of
the rail permanently, including for someone hand-painting a coast who will never touch it, and
Generate additionally has a button in the top toolbar
([Toolbar.tsx:223](../../src/ui/Toolbar.tsx#L223)) — two entry points, one always-open panel.

**Why it matters.** ADR-28 is a strong piece of reasoning that was applied to one of the three
surfaces it describes. Finishing it is smaller than starting it was.

**Candidate shapes.** Left rail becomes strictly *tool options*; the selection inspector
becomes its own region (or moves right, where "what is on the map" already lives) · the
generator collapses to a section header that opens, since it has a toolbar entry point
already · the rail heading stops naming the active layer when the selection spans layers.

**The constraint that governs it:** whatever moves, the rail must keep saying only what is
true of what is actually selected — the discipline WP-19 had to restore when the land-only
branch went stale ([ToolOptions.tsx:349-355](../../src/ui/ToolOptions.tsx#L349)).

**Open:** G6, G7.

### 4.5 Feedback surfaces

**Today.** Three of them, with different lifetimes and no shared logic:

1. The **autosave line**, a `<p>` across the bottom of the window
   ([App.tsx:160-165](../../src/App.tsx#L160)).
2. The **HUD**, inside the stage ([MapStage.tsx:471-491](../../src/canvas/MapStage.tsx#L471)) —
   zoom, cursor, active layer, **cache bytes**, landmass count, ring count, object count,
   selection count, undo depth, plus transient `vectorising…`, `rings frozen`, `deriving
   rings…` and errors.
3. **Toasts** ([ui/Toasts.tsx](../../src/ui/Toasts.tsx)), some carrying an undo action.

Two observations. First, the HUD is **engineering telemetry shown to end users** — `6 cached =
12.4 MB` is a number for whoever is tuning ADR-19's cache strategy. That is not an accident:
`07` §1 makes the HUD the assertion surface every driver reads, and asks for it to be kept.
But a test affordance living permanently in the product's chrome deserves a decision rather
than inheritance, and "split it into a user status bar plus a debug HUD behind a flag" has an
obvious cost — **every existing driver asserts against the current one**.

Second, an inconsistency worth checking before it becomes a habit: ADR-10 promises merge and
split are reported with an "undo-able toast so nothing feels lost".
[useTerrainBrush.ts:96](../../src/canvas/useTerrainBrush.ts#L96) passes an undo callback;
[useSelection.ts:400](../../src/canvas/useSelection.ts#L400) — the merge that happens when a
dragged landmass is dropped on another — shows the message with no action. Same event, two
levels of recoverability, depending on which gesture caused it.

**Open:** G8, G9.

### 4.6 Reach — touch, and the keyboard as an input rather than a shortcut

**Today.** The stage is mouse-only by construction: `onMouseDown` with `e.button` tests,
`window` `mousemove`/`mouseup`, and a non-passive `wheel` listener
([MapStage.tsx:212-252](../../src/canvas/MapStage.tsx#L212)). No pointer events, no touch, no
pinch-zoom. And there is no keyboard path to select or move an object at all — §4.2's
bindings are accelerators for a mouse user, not an alternative to being one.

**Why it is here rather than in `01` §15.** §15 is the list of things **deliberately deferred
from v1**, and neither of these is on it. So right now they are *absences*, not decisions —
which is exactly the state this repo's own conventions say should not persist. Declining
either is completely legitimate; declining it in an ADR, with the reasoning and the rejected
alternatives, is what turns a gap into a scope.

**Worth naming honestly:** a portfolio piece gets opened on a phone, by people who will not
open it again on a laptop. That is an argument about audience, not about engineering, and it
is the human's to settle.

**Open:** G10, G11.

### 4.7 The landing page

**Today.** There isn't one. `index.html` boots straight into the editor
([index.html](../../index.html)), and `README.md`'s deploy section leans on that: "a single
route, so it needs no SPA rewrite rules".

**But it was already decided that there would be one.** ADR-04, on why Next.js was rejected,
says: *"Where it matters — the landing page and public share pages — solve it narrowly:
**prerender the landing page**, and have the Go backend serve share pages with escaped
OG/meta tags."* So a landing page has been assumed since the design interview, has an
SEO strategy attached to it, and has never been designed, scheduled, or given a home in any
phase. It is the one topic in this document that is a **loose end in the design**, not merely
an unfinished surface.

**The structural question is the whole topic**, and it is genuinely open: does the root URL
become a landing page with the editor at a second route, or does the editor keep the root and
the explaining happen inside it (§4.1)? Every other question — content, hero, prerendering,
what the call to action says — is downstream of that one, and U1 bears on it directly: a
landing page is, strictly, one click of friction placed in front of an editor that ADR-07
promises is immediately usable.

**Two things that make it cheaper than it looks.** U8 — the chosen host is the VPS behind
Caddy, so a second route is three lines of config, not a static-host migration. And the hero
problem (what a landing page for a *map editor* actually shows) points at an artefact P1 is
already committed to building: **P1 WP-3's self-contained HTML embed is "scene + viewer
inlined"**, which is precisely what a live map hero needs. Either the landing page comes after
P1 and is nearly free, or it becomes the reason to extract the viewer early. That sequencing
is worth deciding deliberately rather than discovering.

**Open:** G12 … and the rest of the landing-page questions, which are being worked through
now and will be recorded here when they settle.

---

## 5. What this document does not cover

- **Anything P1–P3 owns**: the embed export, `.map.json`, accounts, cloud sync, share pages,
  the npm packages. §4.7 borrows from P1's plan but does not schedule it.
- **v1's deferred features** (`01` §15). A second map style and formal grouping are absent by
  decision; absence of a feature is not a UX gap.
- **The renderer, the geometry pipeline and the interaction invariants.** Four batches have
  been over that ground. Nothing here proposes changing `07`.
- **Debt.** Nothing in this document is debt: it is unbuilt work with no owner yet, which
  `DEBT.md` explicitly does not track. Rows appear only if a decision creates a shortcut.

## 6. Open decisions — every one of these is the human's

None are settled. They are listed with the trade-off rather than a recommendation, except
where the reasoning genuinely points one way. **Nothing becomes a package until the decisions
its topic depends on are answered** (phase-0.5 work order, step 2).

| | Topic | Question |
|---|---|---|
| **G1** | 4.1 | Does the empty canvas explain itself, and how far — a one-line empty state, a dismissible overlay, or a seeded example map? |
| **G2** | 4.1 | Is there a "load an example map" affordance at all, and does it live in the gallery or the landing page? |
| **G3** | 4.2 | What is the keymap? Specifically: single-letter tool keys, `[`/`]` for brush size, Ctrl+A, zoom keys, and `?` for a shortcut sheet |
| **G4** | 4.2 | One central keymap module and one listener, or bindings kept local to the hook that owns each gesture (as now)? The first makes advertising them safe; the second keeps each gesture's keys next to its code |
| **G5** | 4.3 | Do view controls become visible chrome (zoom cluster + fit), or stay invisible and merely get documented in a shortcut sheet? |
| **G6** | 4.4 | Does the selection inspector separate from the tool rail, and if so where does it go — its own region on the left, or the right rail with "what is on the map"? |
| **G7** | 4.4 | Does the generator collapse in the right rail, given it already has a toolbar entry point? |
| **G8** | 4.5 | Does the HUD split into a user status bar and a debug HUD behind a flag? Cost: every existing driver asserts against the current one, and `07` §1 asks for it to be kept |
| **G9** | 4.5 | Should the drop-merge toast carry undo like the paint-merge one does, per ADR-10? (This one looks like a straightforward yes, and is small enough to ride along with whatever lands first) |
| **G10** | 4.6 | Touch: build a story, or decline it in an ADR and add it to `01` §15? |
| **G11** | 4.6 | Keyboard as an *input* (select and move without a mouse): same question, same two honest answers |
| **G12** | 4.7 | **Root URL: landing page with the editor at `/edit`, or editor at the root with the explaining inside it?** Everything else about the landing page follows from this |

## 7. How this becomes work

1. **Settle the decisions for one topic** — not all of them. Each topic is independent and
   any of them can go first.
2. **The topic gets its own design document** in this series (`12-…`, `13-…`) if it is large
   enough to need constraints and fixtures of its own; small topics can be specified inline in
   their batch entry.
3. **An ADR per load-bearing decision**, with the rejected alternatives, in
   `03-architecture-decisions.md`.
4. **Then, and only then**, packages are appended to
   `prompts/phase-0.5-core-editor-improvement.md` as a new batch, numbered from **WP-23**, with
   rows in `05-p0-build-checklist.md`.

**One structural question about step 4, which has to be answered before §4.7 can go anywhere.**
The phase-0.5 work order admits a batch when it "(a) changes the **core editor**, (b) is larger
than a bug fix, and (c) does not belong to P1–P3". Topics 4.1–4.6 pass all three. **The landing
page fails (a)** — it is a second surface, not the editor — and it does not belong to P1, P2 or
P3 either, none of which mentions it. So it currently has **no admissible home in the
roadmap**, which is the same loose end ADR-04 left. The two honest options are to widen
phase-0.5's charter by one sentence — from "the core editor" to "the product's first-party
surfaces" — with an ADR recording why, or to give the landing page its own home. Smuggling it
in under (a) is the option to avoid, because the admissibility test exists precisely to stop
this file becoming a general backlog.
