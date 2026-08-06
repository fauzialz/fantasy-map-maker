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

**Rejected:** a cap dialog at map creation (local maps cost nothing and are unlimited; a
dialog there is a wall in front of *creating*, which ADR-07 forbids); automatic bulk claim
on login; overwrite-in-place; auto-resolving conflicts by newest timestamp (silent data
loss across two clocks); making the whole status bar closeable (would let a user hide a
conflict warning permanently).

## ADR-34 — This repo is the map product; Zitadel is shared infrastructure
**Decision:** The map editor is the **first of several byfauzi apps** behind one Zitadel
sign-in. Topology is **separate backends, separate repositories, one shared IdP**:
`fantasy-map-maker` (this repo — SPA, map API, `architecture/`), a future `writing-app`, and
**`byfauzi-infra`** which operates Caddy, Postgres and Zitadel for all of them. The one
shared thing is **identity**; the data boundary between apps is `user_id` and nothing else,
enforced by a separate database and role per app rather than by discipline. Full topology,
decisions D1–D5 and the migration plan to a consolidated backend live in
**`../platform/README.md`**; the paste-ready setup in **`../platform/01-zitadel-setup.md`**.
Both folders move to `byfauzi-infra` when it exists — they are sited as a **sibling** of
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
behind Caddy rather than to a static host, so `/api/*` stays **same-origin** and arrives as
three lines of Caddy config instead of a migration and a CORS policy. Account deletion needs
a per-app reconcile cron, since nothing announces that a row should stop existing.

**Rejected:** a monorepo (above); a shared central `users` database alongside Zitadel (it
would be a *second* identity store competing with the first — the centralisation was already
built, and it is the IdP); Zitadel user metadata as a general app-data store (k/v, and it
welds app data to the IdP); a shared entitlements service (nothing to share once billing is
per-app); and refresh tokens in the browser (see `platform/README.md` D2 — with every app on
one registrable domain, `prompt=none` renewal needs no long-lived credential in JavaScript at
all).
