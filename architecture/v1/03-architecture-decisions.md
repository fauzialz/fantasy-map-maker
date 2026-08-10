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
**Amended by ADR-44**, which settles *when* the cache is rebuilt — this decision only ever
covered what it holds, and "rebuild whenever the scale changes" was costing a 750 ms hitch.

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
covers Generate and reset-canvas (renamed from new-canvas by ADR-35; the *new map* half is not undoable, because it destroys nothing).
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
**Superseded in part, by events:** WP-15 (terrain move & rotate) was built before WP-20, so
**land, not rivers, is where the two-model frame got debugged**. The reasoning above still
holds and is still why WP-20 was cheap — every transform is lossless on a river — but it is no
longer the pilot. What WP-15 proved carries over: the frame generalises over both models, and
overlap resolution had to be generalised from "the drag vector" to "the gesture" so rotation
resolves too.
**Built, WP-20**, with two corrections to the consequences above. **`objectBounds` did not
grow a path branch and must not**: it feeds the rbush index, and `index.hit` picks by box, so
widening it would have handed rivers exactly the box-picking this ADR forbids. The frame's
needs were met by `worldCorners` (control points inflated by half the maximum width) and the
marquee's by a separate `pathBounds`, which also absorbed `landmassBounds` — one containment
branch now serves both path types. And **ADR-14's spline tool kept only its drawing half**:
leaving its select mode in place would have meant two hit-tests, two Delete handlers and two
undo paths for one gesture, plus control points that worked only while the rivers layer was
active — the layer-scoped selection ADR-28 exists to remove. Picking, reshaping and deleting
a river are `useSelection`'s now; drawing one is still the tool's, and rivers still never
touch the boolean engine.
**Rejected:** picking a river by its bounding box (C4's mistake, on an object whose AABB is
almost all water); **letting the frame interior claim presses for a path-only selection** —
drafted first as ordinary vector-editor behaviour with shift as the escape, and rejected on
review because it is S8 being broken by the decision that states S8: on a corner-to-corner
river the box is ~95% open water, so it would hand you a river drag hundreds of pixels from
any; scaling points without `width` (a river scaled with the map around it comes out a
thread); frame handles outranking control points (they collide precisely at the ends, because
a river's endpoint is usually what defines the corner a handle sits on); and doing landmasses
first, which spends the model's debugging budget on the expensive case.

## ADR-30 — The drawn shape decides: precise picking, honest boxes, a guarded parser
**Decision:** Sprites are picked by their **silhouette as a tie-break**, not by their
bounding box alone: rbush narrows by box, a path containment test prefers a candidate whose
artwork actually covers the point, and topmost-by-Y remains the fallback. **Labels are
exempt** and keep box picking. `spriteExtent` stops scraping numbers with a regex and walks
the path properly, **flattening curves** instead of counting control points as ink. An
unsupported path command **fails loudly** instead of mis-measuring.
**Why:** measured, not assumed — ink inside the selection box is **53%** for mountains,
**50%** for trees, and **28–88%** across the icons. The mean hides the finding: castle is 88%
and near-honest, but **compass is 28%**, worse than any mountain, because a four-armed star
leaves everything between the arms empty. That is WP-20's diagonal-river problem on an
object that is not a path. Precision is a tie-break rather than a filter because ambiguity
between overlapping boxes is the only thing it actually resolves, while a full silhouette
test would make an isolated tree — a few pixels at fit zoom — harder to hit for no gain.
Labels are exempt because the gaps between words are part of the target.
**Consequences:** the box stays — it is still the frame, the marquee target and the rbush key
— but stops being the authority. Bounds must remain computable **without a canvas**, because
they are unit-tested in Node (`07` §4), so flattening is arithmetic over the path string
rather than a `Path2D` probe; the `Path2D` used for picking is a browser-side cache keyed
like the raster cache. Boxes get tighter for free, since a quadratic never reaches the
control point the old regex measured to. And the guard turns an asset swap from a silent
mis-measure into a failing test — `07` §4 has warned about the narrow dialect since WP-8, but
a warning in a document is weak protection for something that goes wrong months later with
"selection feels off" as its only symptom. Authoring procedure in
`HOW-TO-CHANGE-SPRITE-ART.md`.
**Rejected:** full silhouette picking with no box fallback (breaks small targets, Fitts);
silhouette-based marquee (neither meaningful nor affordable); precise picking for labels;
flattening arcs so the dialect could accept them (disproportionate — every design tool can
emit curves instead); and leaving the parser documented-but-unguarded, which is the status
quo that prompted the question.

**Built, WP-21**, with one thing this ADR got wrong and one the design doc did.
**The `Path2D` cache was never needed.** The path walker written for the honest boxes already
emits polygon rings, and `pointInRing` already existed for the terrain work — so picking
ray-casts those rings and the whole feature stays **canvas-free**, not just the bounds. One
parser, two consumers, no browser-side cache to invalidate on a theme change, and the
tie-break is unit-testable in Node. And `10` §5's first acceptance bullet ("clicking between
a compass's arms selects nothing") described the *full precision* this ADR rejects in its
first sentence; the ADR won, and the bullet became two checks that pull opposite ways — a
covered rival wins the click, a lone compass still answers a near miss.
**The two halves fix different sprites, which the measurement only made obvious afterwards:**
flattening tightened mountain 2 by 27% and trees 1 and 3 by 17% and 15%, and moved nothing
else, because every other box was already set by on-curve points — the **compass's box is
eight straight lines and was always honest at 28% ink.** Its problem was only ever that a box
was picking. Shipping either item alone would have left the other's worst case untouched.

## ADR-31 — Monetization boundary: free is what runs in the browser
**Decision:** The free tier is **everything that executes entirely in the browser** — the
full editor, **unlimited local drafts**, and *every* export: PNG/JPG/WebP, `.map.json`, the
self-contained HTML embed, **and SVG/PDF**. What is gated is **consumption of the server**:
cloud-saved maps (**5** free, **100** paid) and hosted sharing (`/s/{slug}`, `/embed/{slug}`).
Paying raises quantity; it never unlocks a capability the free tier lacked. This refines
ADR-01, which deferred billing *infrastructure* rather than the enforcement seam, and ADR-07,
whose "no wall" holds exactly: the wall is on cloud-persistence *quantity*, never on
creating, editing, or exporting.

**Phases are delivery order, not entitlement tiers.** SVG/PDF is the proof: Phase 2's WP-6
re-emits the scene graph client-side and never touches the API, so it is free and available
anonymously despite shipping in the accounts phase. Any future reading of the roadmap as a
price ladder is a misreading.

**Enforcement.** The count check lives in the Go API and the client has no vote. It must be
**atomic**: a bare `SELECT count(*)` followed by an `INSERT` is a time-of-check/time-of-use
race — under read-committed, two concurrent requests both observe 4 and both insert, landing
a capped-at-5 account on 6. Take a per-user row lock (`SELECT … FROM users WHERE id = $1 FOR
UPDATE`) at the top of the transaction; contention is per-user and negligible. The lock must
cover **every insertion path** — create, single claim, bulk claim, and restore-from-trash —
and the count must exclude soft-deleted rows (`deleted_at IS NULL`), or delete-to-make-room
silently fails to free a slot. A client-side count is a UX prediction only; the **402 is the
authority**.

**No separate sharing cap.** One slug per map plus the map cap already bounds shares at ≤ 5;
a second lever would be redundant. Bandwidth is the real exposure — a single popular embed
can outweigh a thousand users' stored maps — but that is a *view* meter, not a row count, and
it gets its own ADR if and when there is data to justify it.

**Backstops, not currencies:** a request body limit (~10 MB, `http.MaxBytesReader`
middleware) and an account-level abuse tripwire (~2 GB). Neither is user-facing. A typical
scene is ~220 KB measured and the 1–2k object perf budget keeps real maps far below the
ceiling, so no legitimate user meets either. The **visible** cap stays a map *count*, because
bytes are not a unit users can predict or manage, and a size cap could only be enforced at
save time — after the work is done — rather than at creation.

**Why this survives the source being public (ADR-32):** enforcement is a count on a row the
client cannot write. Publishing the check grants nothing; a forker would need their own
database, at which point they were never a customer. Secrets stay out of the repo under any
license.

**Consequences:** billing itself — checkout, tiers, entitlement storage — remains out of
scope here and in Phase 2; this ADR fixes only the seam. Because no upgrade path exists yet,
the downgrade policy is recorded intent rather than a build item: an over-cap account keeps
every map readable and exportable and **never has work destroyed by a billing event** (see
ADR-33 for the mechanism).

**Rejected:** enforcing the cap in the browser (unenforceable once the source is public —
the premise this ADR answers); a user-facing size quota (illegible, and enforceable only
after the work is done); a separate hosted-sharing cap (redundant against the map cap);
gating SVG/PDF because it ships in P2 (confuses delivery order with entitlement, and would
put a wall in front of exporting).

## ADR-32 — MIT across the monorepo, sprite art included
**Decision:** **MIT at the repository root, covering everything** — editor, Go backend, the
P3 packages, and the sprite artwork. This **supersedes the AGPL-root / permissive-packages
split** previously recorded under this number.

**Why the split was unsatisfiable:** P1 WP-1 and P3 WP-1 both make sharing the renderer a
*hard constraint* — "do not fork the renderer… extract it into an internal module **the app
also consumes**." That shared core (`src/scene/`, `src/canvas/`, `src/engine/`,
`src/sprites/` — scene types, `migrate()`, ring derivation, sprite registry) is one body of
code the AGPL app and the permissive packages must both import. A root-AGPL tree with
permissive `packages/*` would ship an MIT wrapper around an AGPL dependency: not MIT in any
meaningful sense, and fatal to the adoption P3 exists to enable.

**Why not AGPL at all:** §13 compels publishing *modifications* served over a network —
running an **unmodified** copy is fully permitted. It therefore does not prevent a hosted
clone, only a silent one. It would also have obligated *us* to hand our own users the
backend source including the cap logic, and would have contaminated the P1 embed export:
WP-3 inlines the viewer runtime into a single `.html` the user hosts themselves, so every
export would carry copyleft obligations onto the user. That is the opposite of a free-tier
feature.

**The codebase had already decided this, undocumented.** `src/engine/terrain/contours.ts`
deliberately runs marching squares through **`d3-contour` (ISC)** instead of the
`marching-squares` package, for exactly the reason above — recorded in the file and in
`04-geometry-pipeline.md` S2: *"that package is AGPL-3.0, which would force the whole app and
the planned `@byfauzi/*` packages under AGPL."* A geometry dependency was rejected on those
grounds long before this ADR existed, so an AGPL root would have contradicted a choice
already paid for in code. This ADR makes the existing position explicit rather than
introducing a new one.

**Consequences:** the paywall is unaffected — MIT compels no disclosure at all, and ADR-31's
enforcement was never predicated on secrecy. The P1 embed must carry the MIT notice, which
is one banner comment in the generated file (under AGPL this same fact was fatal; under MIT
it is trivial). A competitor may take the stack, proprietize it, and sell it, owing only the
copyright notice — accepted knowingly: the moat is the hosted service, the domain, the
users, and the artwork, not the source. The sprite art is MIT by explicit choice rather than
oversight.

**Keeping the option open costs nothing now and everything later.** MIT is perpetual and
irrevocable, so every published version stays MIT and can be forked from — relicensing only
ever binds *future* versions (Redis→Valkey, Terraform→OpenTofu). Relicensing also requires
controlling **all** the copyright, which a project loses the moment it merges an outside
contribution without an agreement. `CLA.md` therefore takes a sublicensing grant from
contributors from the start: retrofitting one means chasing every past contributor, and a
single unreachable holdout blocks the change permanently. Note this is insurance, not a plan
— ADR-31's hosted-service model monetises without touching the licence at all.

**Dependency hygiene is part of this decision.** The tree was audited at the lockfile (which
covers transitive deps, unlike a `package.json` read): **no GPL/AGPL/LGPL/SSPL anywhere**;
`marching-squares` is absent entirely rather than merely undeclared; `clipper-lib`'s
ambiguous "BSL" is **Boost** Software License 1.0 (confirmed from the published tarball), not
*Business* Source, which would have forbidden commercial use. MPL-2.0 appears only in
`lightningcss` build binaries, never shipped. The fonts are **OFL-1.1**, which permits
redistribution but requires its notice to travel with the files — relevant to P1's embed
export, which inlines assets into a file the user then hosts.

**Rejected:** AGPL root with permissive packages (contradicts the shared-core constraint
above); AGPL everywhere (kills P3 adoption, which is P3's entire purpose); BSL or another
source-available licence (genuinely does prevent hosted competition, unlike AGPL —
disproportionate for a portfolio project, and revisitable if that ever stops being true).

## ADR-33 — Cloud sync is opt-in per map; local-first is never negotiable
**Decision:** **Local IndexedDB autosave is hardcoded on and cannot be disabled.** Cloud sync
is **opt-in per map**, and a map becomes a cloud row only on an explicit user action — the
save menu, the status-bar call-to-action, or the sync toggle. **The cap is checked once, at
first materialisation, never on an autosave tick.**

**Why:** WP-3 specifies debounced cloud autosave, so saving is a background timer. A cap
dialog cannot be raised from a timer, and a user at cap would otherwise fire a rejected POST
every interval. Making materialisation explicit puts the only capped decision in the
foreground, where a dialog is coherent. The user-facing label is **"Cloud sync"**, never
"autosave" — the local layer already owns that word and never turns off.

**Claim is offered, never automatic.** Login claims nothing by itself. When unclaimed local
drafts exist the user is *offered* a claim: "save all N" when N fits the remaining slots, or
a selection list capped at the remaining count when it does not. Dismissible, loses nothing,
idempotent on `meta.id`, re-openable from the gallery, and suppressible with a preference
that stays re-enableable in settings. This replaces WP-4's automatic bulk claim, which would
have made logging in the most punitive moment in the product — ADR-07 promises login only
*adds*.

**At the cap** the dialog offers **cancel** or **delete-to-make-room**. There is deliberately
**no overwrite-in-place**: its only advantage was slug continuity, which is actively harmful
(a third party's embed would silently begin showing a different map), and it dragged in
`meta.id` rewriting, local re-keying, an orphaned local draft that reads as unsynced
immediately after a successful sync, and a collision when a local copy of the target already
exists.

**Conflict model.** Comparing local and cloud timestamps directly is unsafe — one is
client-stamped, the other server-stamped. `DraftRecord` therefore carries
`lastSyncedLocalAt` and `lastSyncedServerAt`, and each side is compared only against its own
clock. A **genuine conflict is both sides changed since the last common sync point**; the
three other combinations resolve themselves without a prompt. Conflicts surface at four
moments only — boot/open, toggling sync on, a 409 on explicit save, and reconnecting — and
**never auto-resolve**: both copies are kept until the user chooses. Turning sync on is
non-destructive by construction: it goes through the `updated_at` check and, on 409, leaves
sync off and raises the prompt.

**The `past.length > 0` guard extends to the cloud path.** `useAutosave` already refuses to
restore over work in progress, because an async load landing on a stroke the user just
painted is the data loss WP-12 exists to prevent. The network is slower and more variable
than IndexedDB, so the same bug is *more* likely on the cloud path — but the cloud case must
**route into the conflict flow rather than discarding**, since "the user already edited"
means a conflict, not a reason to drop the remote copy. Boot-time prompts are non-blocking.

**Three UI elements, distinct jobs:** a persistent status indicator (cloud state headlines
when sync is on, local state when it is off); a **closeable** CTA banner ("this map is only
on this device"), which is the *only* closeable element, scoped per map, re-shown once per
new session while the map stays unsynced; and toasts for failure, conflict and cap events,
which closing the banner can never hide.

**Deletion is soft** (`deleted_at`, 30-day retention, daily purge), with a trash view,
undo-toast, and explicit permanent delete behind a confirmation. Deleting a cloud map
**never touches the local copy**. Soft-deleted rows do not count toward the cap, so permanent
delete frees storage but no slots — the UI must say so. **Restore is an insertion path** and
goes through the cap check like any other.

**Downgrade** marks maps with `downgraded_at` (distinct from `deleted_at`, so "billing
lapsed" and "user deleted" stay tellable apart), gets its own 60-day grace, and renders as
**"not syncing — over limit"**, never "read-only": the editor never locks, local autosave
continues, and export stays available. Over-limit maps stop accepting PUTs and their share
slugs are disabled. Reclaiming through the same selection dialog nulls `downgraded_at`; only
after the grace expires unclaimed do maps fall into ordinary soft deletion.

**Consequences:** `DraftRecord` gains `lastSyncedLocalAt`, `lastSyncedServerAt`, a
banner-closed flag and a title/thumbnail for the gallery — all local, so
**`02-scene-data-model.md` is untouched**: no `schemaVersion` bump, no `migrate()` step, and
nothing leaks into `.map.json` or the P1 embed. The sync flag itself lives server-side
(`maps.cloud_sync`), which resolves the chicken-and-egg cleanly — "not synced" before
materialisation is simply the absence of a row — at the cost of being global rather than
per-device. Local drafts are LRU-pruned to the ~20 most recent, evicting **only** fully
synced maps; anything local-only or ahead of cloud is never evicted. Opt-in sync also makes
a **merged local+cloud gallery mandatory** rather than optional — scheduled as WP-22.

**Where that gallery lives changed with ADR-40:** it is the **page** at `/maps`, not a dialog, so
the merged list, the sync badges and the **claim offer** all surface there. One consequence is
worth stating precisely, because getting it wrong is that page's worst failure: ADR-40 has `/maps`
redirect to `/maps/create` when the list is empty, and for a signed-in user "empty" means **both
sources empty and both known**. If the API call fails or the browser is offline, show the gallery
with an error state and **do not redirect** — a user with five cloud maps must never be told to
create their first one.

**Rejected:** a cap dialog at map creation (local maps cost nothing and are unlimited; a
dialog there is a wall in front of *creating*, which ADR-07 forbids); automatic bulk claim
on login; overwrite-in-place; auto-resolving conflicts by newest timestamp (silent data
loss across two clocks); making the whole status bar closeable (would let a user hide a
conflict warning permanently).

## ADR-34 — This repo is the map product; Zitadel is shared infrastructure
**Decision:** The map editor is the **first of several byfauzi apps** behind one Zitadel
sign-in. Topology is **separate backends, separate repositories, one shared IdP**:
`fantasy-map-maker` (this repo — SPA, map API, `architecture/`), a future `writing-app`, and
**`fauzialz/infra`** (private) which operates nginx, Postgres and Zitadel for all of them. The one
shared thing is **identity**; the data boundary between apps is `user_id` and nothing else,
enforced by a separate database and role per app rather than by discipline. Full topology,
decisions D1–D5 and the migration plan to a consolidated backend live in
**`../platform/README.md`**; the paste-ready setup in **`../platform/01-zitadel-setup.md`**.
Both folders move to `fauzialz/infra` when it exists — they are sited as a **sibling** of
`v1/`, not inside it, so `v1/` stays the map product's design at version 1 and the move is
one `git mv`.

**Why separate rather than one backend now.** Measured against what it would save: a JWKS
middleware is ~100 lines around a library, and a `users` anchor is five columns. That is the
entire duplication, because the two products share no table — maps are `jsonb` scenes with a
row cap, chapters are text with per-object purchases. The monolith's payoff here is
**operational, not structural**, and roughly equal to the cost of the restructure that buys
it. Consolidation is scheduled by trigger (a third or fourth app, or a cross-cutting change
touching more than two repos in a week), not by date, and `platform/README.md` records the
five phases and which one is the point of no return.

**Why not a monorepo.** It re-opens **ADR-32**, which rejected a root-licence /
subdirectory-licence split as unsatisfiable and settled on MIT covering the whole repository
including the sprite art. Dropping a commercial paywalled app into an MIT-rooted tree
rebuilds exactly that rejected split. It would also force `architecture/v1/` to become
`architecture/map/v1/` and complicate the single-tracker agent workflow CLAUDE.md depends on.

**Billing is separate per app**, so Zitadel stays **identity-only**. No roles are defined;
the sole authorization rule is ownership (`owner_id = sub`) plus ADR-31's count. Free-vs-paid
is deliberately **not** a role or a token claim — a claim is a snapshot from token-mint time,
so an upgrade would not take effect until the token rolled over and a downgrade would keep
the higher cap for the same window. ADR-31 already states the 402 is the authority. Zitadel
project roles remain the right home for coarse `admin`/`staff` if an admin surface ever
exists; per-object sharing would be rows in the owning app, not IdP roles.

**Identity has exactly one source of truth.** Zitadel holds it; each app's `users` row is an
anchor for foreign keys, a lock target for the cap check, and a **cache** of profile claims —
refreshed from the token, never written by the app, safe to rebuild. This corrects
`01-system-design.md` §12, which said the primary key "mirrors Zitadel sub": Zitadel issues
numeric snowflake ids that a `uuid` column cannot hold, and pointing every foreign key at an
identifier another system owns makes an IdP change a full-schema rewrite. Local `uuid` pk +
`zitadel_sub text unique`.

**Consequences:** P2 WP-1 splits — the SPA auth client stays, standing up Zitadel does not,
and the prompt now says so. `auth/` must keep zero map-specific imports, which is what makes
a later extraction a move rather than a rewrite. P0 deploys **frontend-only to the VPS**
behind nginx rather than to a static host, so `/api/*` stays **same-origin** and arrives as
three lines of host config instead of a migration and a CORS policy. Account deletion needs
a per-app reconcile cron, since nothing announces that a row should stop existing.

**Rejected:** a monorepo (above); a shared central `users` database alongside Zitadel (it
would be a *second* identity store competing with the first — the centralisation was already
built, and it is the IdP); Zitadel user metadata as a general app-data store (k/v, and it
welds app data to the IdP); a shared entitlements service (nothing to share once billing is
per-app); and refresh tokens in the browser (see `platform/README.md` D2 — with every app on
one registrable domain, `prompt=none` renewal needs no long-lived credential in JavaScript at
all).

## ADR-35 — "New map" and "Reset canvas" are two buttons, and only one is undoable
**Decision:** The single **New canvas** button splits in two. **New map** creates a separate
map with a fresh `meta.id` and switches to it, leaving the previous map intact in the gallery;
it is **not undoable**, because it destroys nothing. **Reset canvas** empties the map you are
on, **keeping its `meta.id`, title and `createdAt`**, behind a confirm dialog and as one
undoable whole-scene step. Renaming a map is **not undoable** either. Shipped with **WP-22**.

**Why it had to change.** `createEmptyScene` mints a fresh `crypto.randomUUID()`, and
autosave keys records on `meta.id` — so the old single button already wrote a *new* record on
every click and left the previous map on disk with nothing pointing at it. The editor has been
accumulating unreachable drafts since WP-12. That behaviour is exactly "new map" wearing the
label "new canvas", minus any way to get back. Splitting the button makes the two intentions
say what they do, and reset's `meta.id` reuse is what stops it stranding a draft.

**Why only reset is undoable.** ADR-22's granularity rule is about *destruction*: a step exists
so work can come back. Emptying a map destroys it in place, so it needs one. Creating a second
map takes nothing away — the first is a click away in My maps — so an undo step there would
retain an entire scene (ADR-27's cap concern) to reverse something no user would call a loss.
For the same reason, **switching maps clears the undo stack**: a step carries scenes belonging
to the map that produced them, so undoing across a switch would drop another map's geometry
into this one. Undo history is session state and per-map (data model §7).

**Why rename is not undoable, stated rather than assumed.** `diffScene` walks layers and
settings and never touches `meta`, so routing a rename through `record` would file a step
carrying nothing and an undo would silently do nothing — the worst of both. It is `setLayerFlags`'
reasoning: undo should reverse your last *edit*, not your last label. Recorded here because
"why isn't this undoable" is the question a future reader will ask.

**Consequences:** `01-system-design.md` §13 and ADR-27 now say *reset canvas* where they said
*new canvas*. The confirm dialog is the ADR-21 pattern (confirm **and** undo for a destructive
whole-scene action), not belt-and-braces. Deleting a map from the gallery is confirmed but
**not** undoable, and its wording says *this device* — P2 gives a map a cloud copy this delete
must not touch (ADR-33's mirror rule), so a confirmation reading "delete this map" would teach
the wrong thing now and be wrong later.

**Rejected:** keeping one button (it means two things and orphans a draft every time); making
New map undoable (a whole-scene step to reverse a non-loss); dropping reset entirely and
telling people to make a new map and delete the old one (three gestures for one intention, and
it changes the map's identity, so a P2 share slug would break).

## ADR-36 — Commands live in a menu bar; the rails hold only live state
**Decision:** The editor gains a **menu bar** — Map · Edit · View · Help — and the right rail
drops from five sections to two. The dividing rule is: **a menu holds commands and
rarely-changed settings; a rail holds live state you steer while looking at the map.** So the
generator, the document actions (new / open / reset / canvas size) and export move into menus,
while the layer list and the four render settings that re-derive live — parchment, coastal
rings, ring count, ring gap — stay in the rail. The theme stays a **button**, not a menu item.
The map title becomes an inline input in the menu bar, so `Rename` is a control removed rather
than a command added. Full design in `11-editor-shell.md`, which **ships in two packages** —
**WP-23** (§5) and **WP-32** (§3–§4) — see the ADR-40 amendment at the end of this entry.

**Why:** every control in the rail worked; they were filed by the order they were built in
rather than by kind. The tell was two **Generate** buttons — one in the toolbar, one in the rail
— which is what a panel looks like once it has become the place things go when there is nowhere
else. `MapPanel.tsx` was 300 lines and scrolled on a laptop, with ~95 of them a one-shot command
and its seven parameters. ADR-28 fixed the *tools* in the toolbar and deliberately left the
chrome around them alone; this is that follow-up.

**Why some things stay in the rail.** Ring count and ring gap look like settings and are not:
they re-derive the coastal bands live, so you drag them *at* the map, and a menu that must be
held open over the thing you are judging is the wrong container. Land amount and sea level are
the opposite — they only apply on the next Generate — so they belong in the dialog. Bring
forward / Send back / Delete appear in **both** the rail and the Edit menu, which is deliberate
duplication of a command with a shortcut to advertise, unlike the two Generate buttons that were
duplication by accident.

**Consequences:** ADR-21's generate confirmation **folds into the generate dialog** — the dialog
carries the warning line and its primary button reads "Replace map" on a non-empty scene,
"Generate world" on an empty one. The ask still happens only when there is something to lose; a
modal on top of a modal does not. `Canvas size ▸` becomes a **radio submenu**, which makes
"re-picking the size you are already on is a no-op" structural rather than a guard. "My maps"
becomes **Open Map**, because P2 puts cloud maps in the same dialog (ADR-33) and "my maps" will
be ambiguous about whose and where. `deleteSelection` and `restackSelection` move from
`ToolOptions.tsx` into the store — they already called `getState()` internally, and the Edit menu
is the second caller that makes that obvious. The bottom autosave strip is absorbed into the menu
bar, keeping `data-autosave`, so two header rows cost no height.

**Also settled: the seed becomes a world code.** Generation is deterministic, but the seed is
four of the nine inputs `generateWorld` reads, and `seaLevel` / `mountainDensity` /
`forestDensity` are session-only by ADR's own schema rule. A bare copyable seed would reproduce
nothing whenever another knob differed, and would fail *silently*. So the dialog exposes one
human-readable `w1-`-tagged code carrying all seven world inputs; pasting sets every control, and
a malformed or wrong-version code is rejected with a toast and changes nothing (ADR-30's parser
rule). Canvas size and `coastDetail` are excluded — a code should not resize someone's canvas.

**Rejected:** a single header row (it already wraps below ~1400 px and leaves the map title
homeless); moving Appearance into the View menu too (§2's rule — those sliders are live);
persisting the advanced trio into the scene so a bare seed would suffice (a `schemaVersion` bump
and a `migrate()` step to make a text field shorter); keeping the generator in the rail behind a
collapsible (treats the symptom and leaves four unrelated concerns instead of five); and a
`Rename…` command (an inline title input is one control fewer).

**Amended by ADR-40, before either half was built.** Two changes, both of which *remove* from this
design rather than revise it. **`New map` and `Open Map…` leave the `Map` menu** — ADR-40 sorts
controls by scope as well as kind, so "which map" commands live on the gallery page and the menu
keeps only what acts on the map in front of you: `Canvas size ▸`, `Reset canvas…`,
`Generate world…`, `Export image…`. The "My maps → **Open Map**" rename above is therefore
retired along with the item; the *page* is titled **Your maps**, and the ambiguity this ADR
objected to was a property of a command label, not of a heading. And **this document now ships as
two packages** — **WP-23** (the generate dialog, the world code, and the `switchRoot` contrast fix
— §5 entire) and **WP-32** (the menu bar and the slimmed rail — §3 and §4) — with WP-30 in
between, so no menu item is built and then deleted. WP-23 goes first because ADR-40's create page
mounts the same generate form.

## ADR-37 — Erase and the sea brush are two tools; a landmass the eraser touches dies whole
_Narrowed by **ADR-43**: the split stands, but the sea brush is no longer terrain-only — it is a
global tool that switches to terrain, and it answers to that layer's hidden/locked flags._
**Decision:** The contextual eraser splits. **Sea brush** keeps today's behaviour exactly —
terrain-only, subtracts a disc of geometry, can cut a landmass in two. **Erase** becomes a
**global object eraser**, a peer of Select: a drag removes every object the brush disc overlaps
on **every visible, unlocked layer**, landmasses and rivers included, and **a landmass it touches
is deleted whole**. Layer lock and visibility are how the eraser is scoped, exactly as ADR-28
made them the scoping mechanism for Select. **Amends ADR-18**, and reverses ADR-28's choice to
relabel rather than split. Ships as **WP-26**; design in `12-tools-that-say-what-they-do.md`.

**Settled with it:** rivers die to the eraser too — any object, whole, since partial removal of a
path object is a reshape and reshaping is Select's job (D1). Erase sits **beside Select in the
mode group**, a peer of the tool it now matches rather than of the six layers (D2). And **hidden
protects, for every layer and not just terrain** (D3): ADR-28's *visible and unlocked* applied
without exception, so a stroke can sweep the whole map and take only what you left showing.

**Why:** ADR-18's "the eraser removes whatever the active tool creates" was one predictable
model when every tool was layer-scoped. ADR-28 then made selection, transforms and deletion all
cross-layer and left the eraser behind, so the editor now has one tool that still believes in
the old world. Worse, the object eraser's hit test refuses anything without a footprint
(`objectHit.ts`'s `isUnderBrush`), which means **landmasses and rivers have never been erasable
by any tool at any time** — a gap, not a policy. Splitting is what makes both halves
describable: "removes land" and "removes objects" are two sentences, and one button was trying
to be both.

**Why whole landmasses.** Partial removal *is* the sea brush. Two tools that both nibble at a
coastline would be one tool wearing two hats — the situation this ADR exists to end — and a
brush that shaves a coast when you meant to delete an island is the same surprise ADR-18 was
trying to avoid, only pointed the other way. The destructive case is already covered by
granularity: one drag is one undo step, so a wide sweep comes back in one Ctrl+Z.

**Consequences:** `isUnderBrush` grows a path branch for each type, reusing `landmassAt` for
inside-the-coast and `distanceToSegment` (exported from `river.ts`) for near-the-coast, with
`isOnRiver` already taking the slack argument it needs. `eraseAt` walks every live layer rather
than `activeLayerId` and files one step across all of them, the shape `deleteSelection` already
uses. **Hiding a layer now protects it**, not just hides it — which is ADR-28's rule applied
consistently, and worth saying out loud because it gives visibility a second meaning.

**Rejected:** keeping ADR-18 and merely widening the object eraser to all layers (leaves one
button meaning two things, which is the complaint); making the eraser nibble landmasses like the
sea brush (two tools with one behaviour, and no way to delete an island in one gesture); a
confirmation before erasing land (a dialog after the press cannot promise the outcome — C6 — and
would fire on every stroke); and putting Erase in the create row as a seventh chip (the
eight-peers flattening ADR-28 removed).

## ADR-38 — Zoom out goes past the canvas edge; the bound widens, it does not disappear
_Completed by **ADR-42**: this widened the zoom bound and left panning alone, which is exactly
the mismatch that had to be fixed afterwards._
**Decision:** `fitScale` stops being the minimum zoom. The floor becomes
`fitScale × MIN_FIT_FRACTION`, with **`MIN_FIT_FRACTION = 0.5`** — the canvas may shrink to half
the size at which it fills the viewport, and the space around it shows the app background.
**Amends ADR-02**, which set a bounded canvas and no infinite zoom. Ships as **WP-28**; design in
`13-reading-the-map.md`.

**Why:** `fitScale` was doing two jobs — "the scale at which the map fits" and "the furthest you
may pull back" — and only the first is a fact. The second made the canvas impossible to see as an
object with edges, which is exactly the view you want when judging composition or previewing
what an export will contain. The map filled the frame at every zoom level, so the frame was
invisible.

**Why it does not reopen ADR-02.** ADR-02 rejected *infinite* zoom because memory and export
limits stop being predictable without a bound. A floor at half of fit is a wider bound, not the
absence of one: it is a fixed multiple of a quantity that is already derived from the canvas and
the viewport, so the worst case is still `MAX_SCALE` at the other end, unchanged.

**Consequences:** almost none, which is why the number is a constant rather than a feature.
`clampPan` already centres the map on any axis where the scaled map is smaller than the view — a
branch that existed for narrow viewports and now does the letterboxing unmodified. `visibleRect`
begins reporting a rect larger than the map, and `padRect` already clips to the map on both axes,
so layer cache rects stay map-sized and ADR-19's memory budget is untouched. The parchment and
vignette draw the canvas rect, so the region outside it renders as app background — the canvas
gains a visible edge, which is the point.

**Rejected:** removing the floor entirely (ADR-02's reasons hold); making the fraction a user
setting (a preference for a number nobody wants to choose); and zooming to a *fit-with-margin*
that simply pads `fitScale` (it moves the wall back a little and keeps the same problem — the
canvas edge is still the frame edge at the limit).

## ADR-39 — A river's end snaps at draw time, and the reshape is control points
**Decision:** While a river is being drawn, an endpoint within a **screen-space** threshold of a
**coastline or another river** snaps to the nearest point on it. On finish the mouth is
*reshaped*, not merely moved: the snap bakes the final control points **along the local coast
normal**, so the ribbon's end cap comes out parallel to the coast tangent and the mouth opens
along the shore instead of being cut across the flow, overshooting past the coast stroke and the
first ring band. The reshape is expressed **entirely as control points** — no stored outline, no
polygon boolean, **no `schemaVersion` bump**. A river never holds a reference to the landmass or
river it met. Ships as **WP-29**; design in `13-reading-the-map.md`.

**Settled with it:** the end *being laid* snaps, whichever it is (D6) — nothing in the model knows
which end is downstream, since direction is point order and not elevation. **An end that snaps to
nothing is rounded** rather than cut flat, so a river stopping mid-map fades out instead of being
sliced (D6); `riverRibbon` already closes its outline between the last two bank points, so the
cap is an arc across that gap. A **dragged** endpoint re-snaps, with a modifier to suppress it
(D7), while a **moved coastline** re-snaps nothing (D8) — consistent rather than opposed, because
the trigger is always the user's hand on *that river*. **Nearest wins** when a coast and a river
are both in range (D9), and a river never snaps to itself or to the one being drawn (D10).

**Why:** landing a click exactly on a coastline is not possible at fit zoom, where a 4000 px
canvas is a few hundred screen pixels wide. Every river therefore ends either short of the
shore, leaving a stub of land between the water and the sea, or past it with a blunt cap in open
water. Rivers draw above terrain (ADR-15's fixed order), so neither failure hides itself. The
snap fixes the first and the overshoot fixes the second; either alone leaves a visible seam.

**Why screen-space, and why the preview changes first.** The threshold is defined in screen
pixels and converted at the current scale, so the snap feels identical at fit zoom and at 400 % —
the same rule I8 applies to every other piece of chrome, and a map-unit threshold would be
unusable at one end of the range. And a tip that *will* snap must draw differently from one that
will not, **before** the click: invariant I4 says the pointer agrees with what the press will do,
and a snap that only reveals itself afterwards is a cursor that lied.

**Why the reshape is free, and why it is only control points.** Moving the endpoint onto the
coast is not enough — the cap is still cut across the flow, so the mouth reads as a pipe ending
at a wall whatever the point does. But `riverCentreline` is `chaikin(points, 2, false)`, which
**pins the last points the user placed**, and the cap's direction is the tangent of the last two
centreline points. Writing the final points along the coast normal therefore rotates the cap onto
the coast tangent with no new machinery at all. The alternative — clipping the ribbon against the
land polygon so the mouth edge copies the coast *arc* — buys a curved cap for either a stored
outline (a `schemaVersion` bump to persist geometry that is otherwise derived, against ADR-13's
grain) or a draw-time dependency on terrain (the live constraint this ADR rejects, and a rivers
cache invalidated by every terrain edit — DEBT Q-01). The straight cap ships with a `ponytail:`
comment naming the curve as the upgrade.

**River-to-river needs the snap and no reshape at all**, because WP-8 already decided it: a river
is *"flat, opaque and unstroked, so two overlapping ribbons paint the same colour twice and a
confluence is seamless"* (`canvas/draw.ts`). There is no bank stroke to interrupt, so a tributary
whose endpoint lands **inside** the trunk joins it with nothing to hide. The tributary overshoots
past the trunk's centreline by half the trunk's local width so its cap is buried rather than
poking through the far bank. It is not a join: two rivers that meet are two objects that overlap,
and deleting the trunk leaves the tributary ending in open water.

**Why the snap does not persist.** A river that stayed attached to a landmass would mean one
object's geometry depends on another's — a relationship the scene model does not have. Moving or
scaling a landmass (WP-15, WP-16) would then have to drag every river that ever met it, or leave
them attached to a coast that has gone. So the mouth is resolved once and baked into `points`,
and a landmass that later moves simply leaves its river behind, visibly, the way it leaves the
mountains that stood on it.

**Consequences:** nearest-point on a coast is a loop over the landmass rings through
`distanceToSegment`, the module-private helper in `river.ts` that **WP-26 already needs
exported** for the eraser — whichever package lands first pays for it and the other gets it free.
The overshoot distance is a **named constant, not a derivation**: it has to sit right against a
coast stroke that is screen-constant and a ring band whose gap is a user setting from 4 to 60, so
it ships as the number that looked right and the design document says that is what it is. No
scene-shape change and no `schemaVersion` bump — the output is plain points.

**Rejected:** a live constraint that re-snaps when the coast moves (a cross-object geometric
relationship the model does not support, for a drawing aid); **storing a trimmed mouth outline on
the river** (persisting derived geometry, and a `schemaVersion` bump for a cap angle); **treating
a confluence as a real join** with a parent/child reference (it buys nothing the overlapping fill
does not already give, and it invents an ownership relation the scene has nowhere to put);
snapping to the *ring band* rather than the coastline (rings are derived and never stored —
ADR-13 — so the snap target would disappear when coastal rings are switched off); auto-extending
every river to the nearest coast regardless of distance (a river ending in an inland lake is
legitimate); and deriving the overshoot from `ringGap` (it must also cover the coast stroke,
which is screen-constant, so no single map-space formula covers both).

## ADR-40 — The app gets an address space; the menu owns *this* map, the gallery owns *which*
**Decision:** The editor gains routes. A **static landing page** at `/`, and the SPA under
`/maps` — **`/maps`** (the gallery, as a page titled *Your maps*), **`/maps/create`** (a setup
page), **`/maps/edit/{uuid}`** (the editor). One origin, `map.byfauzi.com`, so ADR-34's
same-origin `/api/*` survives. The router is **hand-rolled**, about thirty lines, with no new
dependency. The gallery **dialog is replaced**, not duplicated, and **`New map` and `Open Map…`
leave the menu bar** for the gallery page. Ships as **WP-30** and **WP-31**; full design in
`14-routing-and-landing.md`, which records D1–D12.

**The rule, and it is ADR-36's one level out:** *a menu holds commands and rarely-changed
settings; a rail holds live state* sorted controls by **kind**. This sorts them by **scope** —
everything acting on the document in front of you stays in the chrome around it, everything that
chooses *between* documents lives on a page. The `Map` menu lands on four items, all about the
map you are looking at.

**Why a page rather than the dialog, stated because the dialog worked.** ADR-35 already
establishes that switching maps **clears the undo stack**, since a step carries scenes belonging
to the map that produced them. That is a navigation in everything but presentation: a modal says
"a small thing you can back out of" and the model says the opposite. Making it a route also gives
a map a URL, which is what removes `rememberedOpen()` — the app had been *remembering* what an
address could simply *say*.

**Why `/maps/create` is a page and not a redirect.** `resetCanvas(preset)` does double duty as
*Reset canvas* and *change canvas size*, discarding every object
([editorStore.ts:380-401](../../src/state/editorStore.ts#L380-L401)) — which is why ADR-36 puts a
confirm on `Canvas size ▸`. **Canvas size is free exactly once, at creation**, and there was no
screen at creation on which to offer it. The page also stops a landing-page bounce from writing an
empty draft, which the first-drafted mint-and-redirect would have done on every click.

**Consequences.** `rememberOpen` / `rememberedOpen` and the `loadLatestScene()` fallback are
**deleted** — the route parameter is already the IndexedDB keyPath (WP-22), so the URL is the
source of truth and this package removes a mechanism rather than adding one. The editor route
does nothing at all when `store.scene.meta.id` already matches, which is what lets **Back preserve
the undo stack** — `useEditorStore` is a module singleton and survives an unmount. Every
navigation is a real `<a href>` so *Open in new tab* works, and **every plain left click must
flush autosave first**, because the throttle's `pagehide` flush does not fire on a route change.
Linkable URLs also make **two tabs on one map** easy, which the local save path has never guarded:
a `BroadcastChannel` warns rather than blocking. `11-editor-shell.md` therefore ships in **two
packages** — WP-23 (the generate dialog and world code, which the create page reuses) and WP-32
(the menu bar and rail) — so no menu item is built and then deleted. Dev and production hold the
same routing rule in two places (a Vite middleware and the nginx site) and must agree; *works
locally, 404s in production* has exactly one signal, and it is a deploy.

**Auth is unaffected and gains nothing to build.** ADR-06's OIDC + PKCE redirects to Zitadel's
hosted login, so there are **no `/login` or `/signup` pages** — a Sign in *button*, a signup hint
parameter, and `/auth/callback` landing on `/maps`. Because `platform/README.md` D2 keeps no
refresh token in the browser, a static landing page cannot know it is signed in; it reads a
**localStorage hint**, which is a label and never an authorization decision — ADR-31 already makes
the server's 402 the authority, and 401 is the same.

**Rejected:** `/` as the editor with no landing page (ADR-04 asks for indexable prose, and P2's
share links need somewhere to send "what is this?" traffic); **react-router** (four routes at P2,
none nested — revisit on a measurement or on guarded routes); prerendering the landing out of the
SPA with an SSG plugin (a dependency and a build step to produce a file we can write, and it puts
the editor's shell behind a marketing page); keeping the dialog alongside the page (two renderings
of one list, which is ADR-36's two-Generate-buttons story repeating); a separate app subdomain
(costs a certificate and same-origin `/api/*`, and moves no bytes); a `/maps/create?w=<code>`
parameter (with a real page the code is a field, and a parameter surviving the URL adoption would
re-run the generator on every reload); a live map viewer in the hero (P3's `@byfauzi/map-viewer`
arriving early — revisit when it exists, at which point it is a mount rather than a package); and
keeping `/edit` as a redirect (nothing is deployed, and two spellings of one route from day one is
how an address space rots).


---

## ADR-41 — A river's mouth is clipped by the land, and the clip is derived

**Amends ADR-39**, which shipped the mouth as a straight cap on the coast *tangent* and named
this as its ceiling: *"the upgrade is clipping the ribbon against the land polygon — which is a
genuine polygon boolean, and would mean either storing the trimmed outline (a `schemaVersion`
bump) or re-deriving it at draw time (a live cross-object dependency, which D8 rejects)."*

**Decision: clip, and derive it.** `riverOutline` intersects the ribbon with the landmass
multipolygon at draw time, so the mouth takes the coastline's own shape rather than a chord
across it. `polygon-clipping` is already a dependency; the mask is `landmasses.map(
landmassToPolygon)` with no union, because the library takes a multipolygon directly.

**Derived rather than stored, for the reason ADR-13 already gave for coastal rings.** A stored
outline goes stale the moment a control point moves, so every transform would have to re-clip
anyway — the storage buys nothing and costs a schema bump. Rivers keep plain control points and
the scene contract does not move.

**D8 is narrowed, not overturned.** It rejected a live dependency because a river's *geometry*
should not depend on another object's. Its geometry still does not: the stored points are
untouched and a snapped mouth stays draggable. What depends on terrain is the *drawing*, which
is the same relationship rings already have with land. The cost is real and paid explicitly —
the rivers layer's cache key includes the mask, so a moved coastline re-renders the rivers
rather than leaving a stale mouth on screen.

**It settles `13` D6 by construction.** D6 wanted a rounded end only where the river met
nothing, and WP-29 could not tell the two apart without a flag or a dependency, so it rounded
every end as a recorded deviation. With the clip there is nothing to decide: a mouth that
crosses the coast has its round cap cut off by the coastline, and one that reaches open land
keeps it.

**And the source comes to a point.** `SOURCE_FRACTION` 0.3 → 0, so a tapered river fades in
rather than starting as a blunt stub. An untapered river is still uniform end to end.

**Rejected:** baking the outline into the scene (a `schemaVersion` bump for geometry that is
otherwise derived, stale on the first drag); masking against other rivers as well as land (over
water, two rivers each clipped to the other reduce *both* to their overlap — the confluence is
already seamless because ADR-14's ribbons are unstroked and share a colour); and clipping only
when the end snapped (the mask is the same work either way, and a river deliberately run into
the sea should be masked too — that is what "masked by the landmass" means).

## ADR-42 — Panning has a bound of its own, and framing is not clamping
_Amends ADR-02 and ADR-38 (WP-36)._

**Decision:** the pan clamp keeps **half of whichever is smaller — the map or the viewport —
on screen** (`PAN_KEEP = 0.5`), and **nothing centres the map except an explicit fit**.

**Why the bound moved.** ADR-38 widened the *zoom* floor to half of fit so the canvas could be
seen as an object with edges, and left panning exactly as it was. The two then disagreed: zoom
out and the map floated free, zoom in and its edge was a hard wall again, so anything drawn at
the coast stayed jammed against the side of the screen with no way to bring it inward.

**Why "the smaller of the two" rather than a fraction of one of them.** It is the only phrasing
that means the right thing at both ends of the range. Zoomed out, the map is smaller, so half
*the canvas* may leave the viewport — which is what makes a corner inspectable. Zoomed in, the
viewport is smaller, so the map must still cover half *the screen*: enough slack to work at the
coast, and it cannot be flicked out of sight, which a fraction of the map's own size would allow
once the map is several screens wide.

**Framing left the clamp.** `clampPan` used to centre any axis the map did not fill. That is a
*framing* decision wearing a clamp's clothes, and it had two costs: zooming out to inspect the
coast you were working on threw away the very framing you pulled back to see, and it was the
only thing centring the map on first paint — an invisible dependency that surfaced the moment
the branch was removed. `centred()` is now called where a fit or a reset happens, and the clamp
only ever says how far you may go.

**Still bounded, and it costs no memory** — `padRect` clips every cache rect to the map, so the
empty ground beyond the edge is never rasterised. ADR-38's argument, unchanged.

**Rejected:** slack as a fraction of the viewport alone (right zoomed in, useless zoomed out —
a map smaller than the screen stayed pinned); slack as a fraction of the map alone (lets a
zoomed-in map be pushed entirely off screen); and keeping the centring branch as well (it is
precisely what the complaint was about).

## ADR-43 — The rail follows the tool in your hand; the sea brush is a global tool
_Amends ADR-37 (WP-36, WP-37)._

**Decision:** the tool options rail shows **only what the tool in hand can act on**. A layer's
create options appear while one of its create tools is in hand; a global mode shows its own
options plus whatever acts on the current selection. And the **sea brush joins Select and Erase
as a global tool** — always in the mode group, switching the active layer to terrain, because
terrain geometry is the only thing it edits.

**Why:** ADR-36 sorted controls by *kind* and ADR-40 by *scope*; this is the third and last
axis, **applicability**. Erase was given the rule when it went global (ADR-37) and Select — which
went global two packages earlier, in ADR-28 — never was. So Select on the rivers layer offered
*River width* and *Widen toward the mouth*, which configure only the **next** river and do
nothing whatever to a selected one; Select on terrain offered a brush size and a biome palette
with nothing selected. A control that cannot act is the defect I4 exists to prevent, one level
up from the cursor.

**Two controls are shared on purpose and stay shared:** the biome palette does double duty
(paint default ↔ recolour a selection, `08` D6) and so does text size — but only *with* a
selection, which is exactly the condition that was missing.

**`On overlap` was in the wrong place entirely.** ADR-25's policy is read at **drop** time, when
a dragged landmass lands on another; a brush stroke cannot cause it, because overlapping strokes
union. It now appears only with land selected.

**ADR-37 is narrowed.** It put the sea brush on terrain "where there is geometry to edit", which
made reaching it from any other layer a two-click affair whose first click was the *land* brush —
the one control that resets it. The button is global now; where it puts you is not a compromise
but the honest answer, since the terrain layer is what it writes to. **And both terrain brushes
answer to the terrain layer's own flags, hidden as well as locked** — `12` D3's rule reaching the
one tool that had never been told.

**Rejected:** keeping the create chips visible under a global mode as the way back (they are the
residue the rule exists to remove; the toolbar's layer button is the way back), and a chip group
of one — `[Draw]`, `[Place one]` — which is a label pretending to be a control.

## ADR-44 — A gesture may look stale; it may not stall
_Amends ADR-19 (WP-36)._

**Decision:** during a zoom the cached layers keep their **old resolution** and are re-cached
once, when the gesture settles; the cache never builds a **hit canvas**; and a layer with no
objects is treated as **live** rather than cached.

**Why:** ADR-19 settled *what* is cached and how big. It said nothing about *when* the cache is
rebuilt, and the answer had been "whenever the scale changes by any amount" — five viewport-sized
renders over every object on the map, per wheel step.

**Measured, on one pinned world** (`w2-483920104-0.45-0.60-single-auto-0.50-0.50-5`, 920 objects,
1440×900 at dpr 1, frame times from `requestAnimationFrame`, same map before and after):

| | before | after |
|---|---|---|
| zoom in, p95 · max | 66.7 · 83.4 ms | **16.8 · 16.8 ms** |
| zoom out, p95 · max | 116.6 · 150 ms | **16.7 · 16.8 ms** |
| space-drag, p95 · max | 249.9 · **749.9 ms** | **16.7 · 33.3 ms** |
| cached bitmaps | 11.5 MB | **7.7 MB** |

The median was 16.7 ms throughout, before and after: this was never sustained slowness, it was a
hitch — which is why it read as lag rather than as a slow app.

**The hit canvas is the part worth remembering.** Konva allocates a *second* full-size canvas for
hit detection on every `cache()`, and a CPU profile put **51% of a whole space-drag** inside
`HitCanvas → setSize → scale`, against **0.4%** in `drawLayer` — the function actually drawing
the map. Nothing here reads it: the layers and their shapes are `listening={false}` and
per-object picking is rbush's job (ADR-16). It cannot be switched off and `0` falls back to `1`,
so `hitCanvasPixelRatio` goes to `0.01`.

**The trade is stated plainly:** mid-zoom the map is drawn from a bitmap made at a different
scale, so it is *soft* until the gesture ends. Softness is recoverable and a stall is not.
**Containment still forces a re-cache even mid-zoom**, and that is not optional — a zoom-out that
outgrows its bitmap would leave the map beyond it simply missing rather than blurred.

**Rejected:** re-caching every step and accepting the hitch; deferring the containment re-cache
too (blank map edges during a drag); and spreading the re-cache across frames, which is the next
lever if one is ever needed — at these numbers there is nothing left to chase.

## ADR-45 — The brush refuses to place; it never deletes what is placed
_WP-35._

**Decision:** the scatter brush carries a **rejection radius**. A candidate landing within a
fraction of drawn height of a sibling is **not placed**. Nothing already on the map is moved or
removed.

**Why the question came up:** a scattered mountain half-buried behind another is nobody's
intent, and the obvious remedy — cull whatever ends up more than half hidden — would be the
first thing in this app that destroys the user's work without a gesture. Principle 2 says every
object is ordinary, hand-editable geometry; a tool that quietly deletes some of it is a
different product. Preventing the pile-up costs the same and takes nothing away.

**The radius is a fraction of drawn height, and pairwise** — the mean of the two sprites'
heights. A fraction because `SPRITE_HEIGHT` has been retuned twice already (WP-28 did it in one
package) and an absolute spacing would silently change meaning each time; pairwise because
`spriteScale` is a knob, so 300% mountains beside 50% ones is an ordinary map and a single
radius would be visibly wrong on it.

**Per kind, defaulting to the generator's own accepted ratios** — 0.58 for mountains (58 against
a 100-unit sprite) and 0.40 for trees (34 against 84). Those numbers already produce a look this
project accepted, so the brush and the generator agree about what a filled hillside is. **0 is
off**, and restores the previous brush exactly, so the escape hatch needs no control of its own.

**`place` is exempt.** A deliberate click is never silently refused — the same rule that lets the
frame's handles overrule the size knob — and the control is *absent* in that mode rather than
disabled, so nothing implies otherwise.

**The generator is untouched**, so there is no new world input and no `w3-` (WP-33's D1 again).

**Rejected:** deleting or nudging what is already placed; a true ink-overlap test (WP-21's
silhouette makes it possible, at O(n·m) polygon intersection per candidate, for a result that
looks the same — recorded as the ceiling in a `ponytail:` comment); and one shared fraction
across kinds, which cannot express that peaks want more room than trees relative to their size.

## ADR-46 — The VPS serves through nginx; the Caddyfile becomes an nginx site
**Decision:** Every reference to **Caddy** in `../platform/` is replaced by **nginx**. The
VPS terminates TLS and routes in nginx, on the host, using a **Cloudflare Origin
certificate**; the `caddy` service leaves `compose.yml`, and the Caddyfile in
`platform/01-zitadel-setup.md` §4 is re-expressed as an nginx site. **Amends ADR-34 and
`platform/README.md` D4**, both of which named Caddy incidentally while deciding something
else — ADR-34 decided *the VPS, same-origin*, and that is untouched. **Nothing in `src/`
changes.**

**Why.** The box already runs nginx on `:80`/`:443`, in front of a live Next.js site. Two
web servers cannot hold the same ports, so the choice was never "which is nicer" — it was
"do we displace a running site to match a document". Caddy's headline advantage is
automatic certificate issuance and renewal, and that advantage does not exist here: the
domain sits behind Cloudflare with an **Origin certificate valid to 2041**, so there is no
ACME challenge to serve, nothing to renew, and no `/.well-known/` path that every future
vhost has to remember to leave unauthenticated. The feature Caddy would be adopted *for* is
the one feature this deployment cannot use.

**What it costs.** Two config artifacts (a compose service, a site file) and about thirty
prose mentions. **Zero lines of application code** — the routing *rule* (`/maps*` →
`app.html`, extensionless → `.html`, everything else → a static 404) is server-agnostic and
lives in `vite.config.ts` for dev, which is why the mirror in `14` §4.1 needed no change
beyond the name of the thing it mirrors.

**One documented footgun disappears.** `14` §3 warns that P2's `/s/*` and `/embed/*` must be
written *before* the SPA fallback, because Caddy's `handle` blocks match in written order.
nginx matches by **longest prefix**, so `location ^~ /s/` beats `location /` wherever it
sits in the file. The ordering hazard is not mitigated, it stops existing.

**What gets harder, and it is real.** Zitadel at P2. Caddy proxies its gRPC-Web/Connect API
with one `transport http { versions h2c 2 }` line; nginx cannot reach an h2c upstream
through `proxy_pass` at all, and needs `grpc_pass` on the gRPC paths. gRPC-**Web** rides
HTTP/1.1 and is likely fine through a plain proxy, but *native* gRPC — which a Go service
calling the Management API would use — is not. This is one config block, months away, and
`platform/01` §4 now carries both forms with a "verify against the version you pin" note
rather than a guess.

**Rejected:** displacing nginx and putting Caddy on `:443` in front of the existing site
(matches the documents, and risks a live site to do it — the documents are cheaper to
change than the deployment); running Caddy behind nginx on other ports (two proxies, one
purpose); and leaving the docs saying Caddy while the box runs nginx, which is what
`platform/` looked like until this ADR and is the state that gets pasted into a terminal at
2am. Also rejected: certbot/Let's Encrypt, which would work but publishes every hostname it
issues for to the public Certificate Transparency logs — the Origin cert does not.
