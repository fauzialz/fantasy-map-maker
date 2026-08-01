# map.byfauzi.com — Architecture Decision Log v1

Every load-bearing decision made during the design interview, with the rationale and
the alternatives rejected. Format is lightweight ADR. Read this to understand *why*
the system is shaped the way it is before changing anything.

---

## ADR-01 — Project ambition: polished portfolio, SaaS-ready
**Decision:** Build a polished, deployed portfolio project, but architect with clean
seams so it can graduate to a SaaS later.
**Consequence:** No premature scale cost (no billing, no multi-region), but *do* add
cheap future-proofing now: client-generated UUIDs, a nullable `tenant_id` column, and
a separated API boundary.

## ADR-02 — Map representation: vector scene-graph, bounded canvas
**Decision:** The map is a **vector scene-graph of objects**, on a **bounded** canvas
(generous but fixed extent). **No infinite zoom.**
**Why:** Per-object editing (resize/layer/delete each mountain), clean SVG export
later, small file sizes, and the coastal-ring effect all fall out naturally from
vector geometry. Bounded canvas keeps memory + export limits predictable.
**Rejected:** Raster/pixel painting (no per-object editing, no SVG); pure tile/grid
(too "game-map", not painterly); infinite zoom (unbounded memory/export).

## ADR-03 — Rendering library: react-konva (Konva.js)
**Decision:** Use **react-konva**.
**Why:** Konva keeps a **scene graph of shape objects** (matching per-object editing)
with free hit-detection, transforms, and layering, but renders to a **2D canvas** so
it stays fast with many objects. Serializes cleanly to JSON (= save format + library
input). Sits naturally in React (helps the P3 React library).
**Rejected:** SVG-DOM (chokes past a few hundred nodes); PixiJS/WebGL (faster, far
more work for interactive editing — kept as an escape hatch only).

## ADR-04 — Frontend shell: React + Vite SPA (not Next.js)
**Decision:** React + Vite **SPA**.
**Why:** The backend is a separate Go service, so Next's server buys nothing here. A
Vite SPA is lighter, deploys as static files, keeps a clean API boundary, and makes
the React-library extraction easier.
**SEO note:** The editor is behind interaction, so SEO is irrelevant there. Where it
matters — the landing page and public share pages — solve it narrowly: **prerender
the landing page**, and have the **Go backend serve share pages with escaped OG/meta
tags + a thumbnail**. Not a reason to adopt Next.

## ADR-05 — Backend: Go + Postgres
**Decision:** Go API (chi or echo) + Postgres, scenes stored as `jsonb`.
**Why:** User preference; simple, fast, boring. Most complexity lives client-side.
`sqlc` for typed queries.

## ADR-06 — Auth: Zitadel (self-hosted), OIDC + PKCE
**Decision:** **Zitadel**, self-hosted, OIDC/OAuth2, PKCE flow in the SPA, upstream
logins Google + GitHub + email/password.
**Why (vs Keycloak):** Zitadel is **written in Go** (matches the backend, one mental
model), **multi-tenant + OIDC-first**, lighter to operate, and has a managed-cloud
escape hatch. Being a standalone IdP, other apps reuse it by registering as their own
OIDC clients — the "reuse across my apps" requirement.
**Free?** Yes — Apache-2.0 open source; self-hosting is free. Managed cloud (free
tier + paid) is optional.
**Rejected:** Keycloak (JVM, heavier ops, no official managed); rolling a custom
OAuth2 server (more work than warranted for a portfolio).

## ADR-07 — No login wall; local-first persistence
**Decision:** The editor is fully usable **anonymously**. Login (P2) only unlocks
cloud save/sync. Anonymous work autosaves to **IndexedDB** (not localStorage).
**Why:** A login wall kills the portfolio demo. IndexedDB (not the ~5 MB localStorage)
because a scene with hundreds of objects + a thumbnail blows past localStorage limits.
**Consequence:** Client-generated map UUIDs from day one so login can **claim** local
drafts idempotently.

## ADR-08 — Phase order: distribution split around persistence
**Decision:** P0 core → **P1 backend-free distribution** (self-contained HTML embed,
`.map.json`) → **P2 accounts + hosted sharing** (share links, live iframe) → P3
React library.
**Why:** A hosted `/s/{slug}` or live `/embed/{slug}` URL *requires* server storage —
i.e. persistence. So "distribution before persistence" only works for the
**backend-free** forms. Hosted sharing rides with persistence in P2.

## ADR-09 — Terrain brush: area brush (paint fills a landmass)
**Decision:** The terrain brush paints an **area that becomes a filled landmass**
(not an outline that fills).
**Implementation note:** the terrain layer is a **raster↔vector hybrid** — a raster
scratch mask during the drag, vectorized to a polygon on stroke-commit. Name this
explicitly; it is not "pure vector" during editing.

## ADR-10 — Land organization: per-landmass objects, auto merge/split
**Decision:** Each disconnected landmass is its **own object**. Painting that bridges
two landmasses **unions** them; the **sea/eraser brush** that cuts one **splits** it
(via connected-components after the boolean difference).
**Identity on merge/split:** **the larger piece keeps the id/name**; the smaller gets
a fresh id + empty name (with an undo-able toast).
**Rejected:** single merged terrain blob (can't grab "just that island").

## ADR-11 — Water model: water = absence of land
**Decision:** Water is **derived** — everything not-land is water. Lakes are polygon
**holes**; island-in-a-lake is a land polygon inside a hole (even-odd fill). The
**eraser IS the sea brush** (one water tool).
**Why:** One source of truth (land). No precedence conflicts, no undefined gaps, no
duplicate tool set. Nested features come free from polygons-with-holes.
**Rejected (deferred):** first-class paintable water bodies/canals — only needed for
thin explicit water (rivers/canals), which are handled separately or deferred. Their
edge cases (two desyncing polygon sets, land/water precedence, undefined gaps, doubled
tools, rings-on-rivers) aren't worth it for v1.

## ADR-12 — Coastline character: user "coast detail" slider (default mid)
**Decision:** Ship a **coast-detail slider** (drives Chaikin smoothing + Douglas–
Peucker simplify strength), default in the middle.
**Why:** Same code path whether "clean/stylized" or "rough/natural"; expose the
parameter instead of hard-coding an aesthetic.

## ADR-13 — Coastal rings: buffer the union of all land, clip to water
**Decision:** Derive rings by buffering the **union of all landmasses** outward in
`ringCount` steps, clipped to the water region. Never stored.
**Why (two wins from one choice):** (1) Growing the land union simultaneously expands
the ocean coast and shrinks lake-holes → **ocean + lake rings from one algorithm**.
(2) Computing from the *union* means rings between close islands **merge into a shared
band instead of colliding** → fixes the strait/pinch artifact.
**Rings apply to:** ocean **and** lakes. Not rivers.

## ADR-14 — Rivers: manual spline tool, in P0, decoupled
**Decision:** Rivers are a **manual spline tool**, present in **P0**, but architected
**separately** from the land/water boolean engine. Tapering polyline, **no rings**,
rendered above land. **Not** auto-generated in v1.

## ADR-15 — Layers: fixed semantic set; z-order auto-by-Y + scale + manual
**Decision:** **Fixed semantic layers** (Terrain, Forests, Mountains, Rivers, Icons,
Labels), each with visibility + lock. **No freeform Photoshop layers.** Inside a
layer, effective z-order = **`(manual z, Y, scale)`** — auto-by-Y with a bigger=front
tie-break, plus a manual bring-forward/send-back override.
**Why:** Macro order guarantees the map reads correctly (labels never hide behind a
mountain). Intra-layer ordering covers "make this bigger tree sit in front."

## ADR-16 — Selection: multi-select (marquee + shift), rbush-backed
**Decision:** Marquee-drag + shift-click multi-select, backed by an **rbush** spatial
index.
**Why:** Scatter-heavy editing (dozens of mountains) makes single-select painful.

## ADR-17 — Scatter objects: independent (no formal grouping in v1)
**Decision:** Scatter-brushed objects are **independent**; grab a range via marquee.
**Rejected (deferred):** auto-grouping into a "range/cluster" (adds group-transform +
nested-selection complexity).

## ADR-18 — Eraser is contextual to the active tool
**Decision:** "Erase" removes whatever the active tool creates — geometry on Terrain
(sea brush), objects on Mountains/Forests/Icons (object-eraser brush). Also
click-select → Delete.
**Why:** One predictable mental model; no separate mode-hunting.

## ADR-19 — Perf: active layer live, others cached at viewport resolution
**Decision:** Only the **active layer keeps live nodes**; every other layer is a
**cached bitmap**, cached at **viewport/display resolution, not full-map resolution**.
Heavy geometry runs in a **Web Worker**.
**Why:** One-layer redraws keep 1–2k objects smooth. Viewport-resolution caching
avoids the ~290 MB six-layer memory trap.

## ADR-20 — Canvas presets + object budget + export clamp
**Decisions:**
- **Canvas:** presets — Landscape 4000×3000 / Square 3000×3000 / Portrait 3000×4000.
- **Perf budget:** ~1,000–2,000 objects smooth on Konva 2D. WebGL is the noted
  upgrade only if far denser.
- **Export:** **cap + warn** (clamp scale to ~16k px/side, under browser limits);
  tile-render + stitch is the noted upgrade.

## ADR-21 — Generator: noise → terrain + mountains + forests, multi-biome
**Decisions:**
- **Populates:** terrain + mountains + forests (not icons/labels, no auto-rivers).
- **Controls:** minimal (Land amount, Roughness, Seed/re-roll) **+ Advanced drawer**
  (sea level, mountain/forest density, world type).
- **Biomes:** modest set — grassland, forest, desert, snow, swamp — from
  elevation × moisture × latitude.
- **Reuses the brush commit pipeline** wholesale; runs in the Worker; **object counts
  capped + Poisson-thinned** to stay in budget; **speck islands filtered**.
- **Seed is metadata only**; output is concrete editable geometry.
- **Replaces the canvas behind a confirm modal**; the replace is **one undoable
  command**.

## ADR-22 — Undo: command stack, one action = one step
_Implementation shape recorded separately in **ADR-27**: one diff mechanism, not a class per
command name._

**Decision:** Zustand + a command stack. One brush stroke / one scatter-drag / one
generate = **one undo step**. Terrain commands store before/after polygons of only the
affected landmass(es); Generate stores the entire previous scene (atomic, reversible
even past the confirm modal).

## ADR-23 — Schema versioning from day one
**Decision:** `schemaVersion` + a pure `migrate(scene)` run on every load, with each
schema change shipping its migration step in the same commit.
**Why:** Saved files and the React library will outlive schema v1.

## ADR-24 — Frontend styling: Tailwind v4 + tailwind-variants + CSS-variable tokens
**Decision:** Style the DOM UI (chrome around the Konva canvas) with **Tailwind CSS v4**
(CSS-first config), component styles composed via **`tailwind-variants`**, **Lucide**
for chrome icons, **self-hosted fonts**, and a **CSS-custom-property token system** that
also recolors the canvas SVG. Radix UI provides the accessible primitives (dialog,
slider, dropdown, tooltip, toggle, popover), styled with our tokens. Full detail,
config sketches, and the token list live in `06-frontend-styling.md`.
**Why (vs CSS Modules / a full design system):** Tailwind is the DX the human wants and
is ideal for the app; `tailwind-variants` + tokens keep it on-brand and library-safe;
Radix gives accessibility without a visual straightjacket; a full design system
(MUI/Chakra) would fight the fantasy identity and bloat the P3 library.

**Prefix:** use v4's `prefix(mbf)` **from day one** (classes are `mbf:…`), contained in
`tailwind-variants` component definitions. Chosen because the project targets a
publishable React library (P3); prefixing later would mean rewriting class strings.
*Revisitable:* if the colon-prefix verbosity hurts DX and the library is deprioritized,
drop to unprefixed and add the prefix at P3.

**Library isolation stance (P3):** `prefix(mbf)` + **Preflight disabled in the library
build** (split imports, omit `preflight.css`) isolates OUR classes from a host app.
The remaining gap — a host's **global** styles bleeding INTO our subtree — is
**documented as a known limitation for v1** (wrap in `.mbf-root`, ship a scoped reset);
**Shadow DOM is deferred to P3** as the full-isolation upgrade, and the P1 iframe embed
already gives total isolation for the viewer use case.

**Two v4 facts to verify against live docs at implementation** (recorded offline, docs
were unreachable): (1) whether `prefix(mbf)` attaches to per-layer imports when Preflight
is split out; (2) whether v4 supports selector-scoped `important`. Neither is
load-bearing — prefix + no-Preflight isolates regardless.

## ADR-25 — Terrain becomes selectable objects, after P0, defaulting to "keep apart"
**Decision:** Landmasses become selectable, colourable and transformable — as a
**follow-up to P0 (WP-14…WP-17), not inside it**. When a dragged landmass would overlap
another, the outcome is chosen by a **three-option radio in the terrain panel** — keep
apart / merge / carve — read at drop time, **defaulting to "keep apart"** (the landmass
slides back along the drag path to the last position that fit).
**Why after P0:** every tier needs UI that WP-13 builds — a biome palette, a rail settings
group, toasts carrying actions — and the tiers rewrite interaction invariant I9. Doing it
against the stand-in rail would be rework, and P0's definition of done does not depend on
it.
**Why "keep apart" as the default:** a default is what happens when nobody chose, so it has
to be the outcome that cannot lose work. Merging is destructive (two objects become one, an
id disappears) and carving can split or erase a landmass; sliding back changes only a
position, and its worst case is a drag that visibly didn't take.
**Why a setting rather than a prompt:** a modal appears *after* the press, so the cursor
cannot promise the outcome (invariant I4), and it repeats for every nudge. A setting read
before the drag lets the pointer advertise the result; the existing toast then reports what
happened and offers the other two outcomes as one-click alternatives.
**Rejected:** widening `hasFootprint` to cover landmasses (see I9 — it hangs handles off
geometry the transforms refuse to move); allowing landmasses to overlap at rest (brings back
`z`, draw order and a topmost-hit rule, all of which the no-overlap rule makes unnecessary).
**Detail:** `08-terrain-as-objects.md` (design) · `prompts/phase-0.5-core-editor-improvement.md` (work order, Batch 1).

## ADR-26 — Ring offsets use Clipper, not `polygon-offset`
**Decision:** S12 `offsetGrow` uses **`clipper-lib`**'s `ClipperOffset`. `polygon-offset` is
removed from the project.
**Why:** `polygon-offset` offsets every edge into its own polygon and unions the pile through
`martinez-polygon-clipping`. Cost grows roughly with the **square** of the coastline's point
count, and martinez hits an undefined-variable bug (`ReferenceError: event is not defined` in
`findIterBrute`) on complex input. Painted coastlines are 100–300 points and stay under the
ceiling; generated ones are 600–2,800 and do not. Measured at 4000×3000, ringCount 4: one
continent **2,493 ms → 119 ms**, several **10,964 ms → 194 ms**, and an archipelago that
**threw after 29 s → 488 ms**. All 17 ring fixtures including the strait pass unchanged — the
algorithm did not move, only the offsetter under it. `04-geometry-pipeline.md` always named
"Clipper/`polygon-offset`"; this picks the other one.
**Consequence:** winding is normalised on the way *into* the offsetter rather than trusted,
because orientation is exactly what makes ADR-13's two-for-one work — an outer ring grows into
the ocean, a hole wound the other way shrinks into its lake. The worker bundle grows ~80 KB,
which is off the main thread and does not touch first paint.
**Rejected:** simplifying the land union before offsetting (measured — ε=10 halves the time
and still throws); a distance-field ring pipeline (no new dependency, and O(pixels), but it
replaces S12/S13 and their fixtures — kept as the noted escape hatch if Clipper ever falls
short).

## ADR-27 — Undo is one diff mechanism, not a command class per action
**Decision:** ADR-22's command stack is implemented as a **single diff mechanism**: a step is
the set of objects an action touched, per layer, before and after. There is no `PaintLand`
class, no `Scatter` class. Gestures capture the scene at pointerdown and commit at pointerup.
**Why:** the granularity promise ("one stroke = one step") is a property of *when* you commit,
not of how many command types exist. One mechanism gets it for free for every gesture,
including ones not yet written, and it satisfies §13's "only the affected landmass(es)"
requirement by construction rather than by each command remembering to. A whole-scene variant
covers Generate and new-canvas.
**Consequences:** comparison must be **by value** (the worker returns fresh objects for
unchanged landmasses); slider steps must **coalesce** by label and target; and the stack needs
a **cap**, because whole-scene steps retain entire scenes. Full detail in
`01-system-design.md` §13.
**Rejected:** a class per command (more code, and each new gesture must re-derive the
granularity rule); storing whole-scene snapshots for everything (simple, but a 2k-object scene
per keystroke).

## ADR-28 — Selection is global; the toolbar separates mode from layer
**Decision:** The Select tool stops being scoped to the active layer. It hit-tests and
transforms **every visible, unlocked layer at once**, and the toolbar splits into two groups —
**mode** (Select, Erase) and **create** (the six layers). Layer **lock and visibility** become
how a selection is scoped. A layer counts as **live** when it is active *or* holds a selected
object. Landmasses join the same selection at **WP-19**, once WP-14…WP-17 have made them
transformable — which settles **D1** (`08` §8) as *yes, two interaction models*.
**Why:** the toolbar was flattening two orthogonal axes — what you are making, and what the
pointer does — into one row of eight peers, which is why Select read as a broken sibling and
why "disabled on Terrain" felt arbitrary. Underneath, the per-layer restriction was **narrower
than invariant I9**, which already promises that anything with a footprint is selectable and
transformable "with no further work". Mountains + forests + icons + labels *is* `hasFootprint`.
The index, the undo stack and the transforms already operate on plain object arrays, so this is
mostly removing a restriction rather than adding a mechanism.
**Consequences:** a drag must apply **one resolved delta** to the whole selection, because
"keep apart" can slide a landmass back along the drag path and sprites dragged with it would
otherwise end up off the land they stood on; the marquee is deliberately **asymmetric** —
intersection for footprint objects, containment for land; and the live-layer rule trades
bitmap memory for draw time, which the ~1–2k budget absorbs because that budget is on total
objects, not per layer. Full design in `09-selection-across-layers.md`.
**Rejected:** leaving Select per-layer and merely not disabling it (papers over the hierarchy
and makes the button silently change your layer); a separate type-filter UI for marquee
over-grab (scope creep — the layer panel already has the controls); splitting Erase into a
global object eraser plus a terrain-rail mode (amends ADR-18, and makes Erase delete objects
for someone on Terrain who expected the sea brush — it is **relabelled** instead, reading "Sea
brush" on Terrain); and **automatic ride-along**, where moving land carries its contents
without selecting them (hidden behaviour, needs a containment query and a coast-straddling
policy, and the marquee plus a double-click give the same ergonomics explicitly).

## ADR-29 — Path objects get frames, and rivers prove the model first
**Decision:** Path-based objects gain a **transform frame** — the same box, handles and
rotate stalk sprites have — and their transforms **bake into their points**. **Rivers go
first (WP-20), before landmasses (WP-19).** Scaling a river multiplies its `width` as well as
its points. The frame is **feedback only**: picking stays path-based (`distanceToRiver`,
point-in-polygon for land), because an AABB over a meandering path is mostly empty space. A
river's **control points outrank the frame's handles** when the two collide, and the frame's
**interior is inert** for a path-only selection — the box draws the selection and takes no
press at all, with the cursor resolving the identical precedence.
**Why:** this is the D1 two-model rewrite, and it has to happen somewhere. Rivers are the
cheapest possible place: every constraint that makes landmass transforms hard is absent —
rivers overlap deliberately (so no overlap policy and **no shared-delta problem**, WP-19's
riskiest item), they never get rings (so nothing to freeze or re-derive against C2's
119–488 ms), and their points are the user's own control points rather than a
Douglas–Peucker simplification (so scale is lossless and C3's re-simplification never
arises). Move, rotate and scale are **all lossless on a river** — the only type in the scene
for which that is true. Proving frame-plus-bake there costs a misplaced river when it goes
wrong, rather than a ruined coastline and a saturated worker.
**Consequences:** `objectBounds` and `frameOf` each grow a path branch, and
[transform.ts:9](../../src/scene/transform.ts#L9)'s blanket refusal to move path objects is
retired for rivers — that refusal was the guard standing in for the frame not existing yet.
The gesture ladder gains a rung above handles. **Frame shape and hit shape become separate
concepts** (S8), which WP-19 inherits rather than rediscovers — and "hit" includes I5's
frame-interior move rung, which is where the distinction is easiest to lose. Nothing existing
is traded away: the box is added and takes nothing over. ADR-14 is untouched — rivers keep
their own spline tool for drawing and point editing; this only adds a second way to move the
whole thing.
**Rejected:** picking a river by its bounding box (C4's mistake, on an object whose AABB is
almost all water); **letting the frame interior claim presses for a path-only selection** —
drafted first as ordinary vector-editor behaviour with shift as the escape, and rejected on
review because it is S8 being broken by the decision that states S8: on a corner-to-corner
river the box is ~95% open water, so it would hand you a river drag hundreds of pixels from
any; scaling points without `width` (a river scaled with the map around it comes out a
thread); frame handles outranking control points (they collide precisely at the ends, because
a river's endpoint is usually what defines the corner a handle sits on); and doing landmasses
first, which spends the model's debugging budget on the expensive case.
