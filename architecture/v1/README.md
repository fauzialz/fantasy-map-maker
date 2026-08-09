# map.byfauzi.com — v1 Engineering Docs

A browser-based **vector map generator & editor** with a fantasy-cartography look
(Lord of the Rings / Game of Thrones style). Paint landmasses with a brush, get
automatic concentric coastal "wave" rings, scatter mountains/forests, place icons,
draw rivers, or generate a whole world from noise — then export as an image or embed.

This folder is the **design source of truth** for v1 and the set of **per-phase
prompts** used to drive an AI coding agent through the build.

---

## How to use these documents

**Read order (humans):**
1. `01-system-design.md` — the whole system, end to end.
2. `03-architecture-decisions.md` — *why* each choice was made (skim if short on time).
3. `02-scene-data-model.md` — the data contract everything else depends on.
4. `04-geometry-pipeline.md` — deep spec for the risky terrain/rings/generator geometry.
5. `07-interaction-invariants.md` — hard-won rules for anything pointer-driven, and how
   to actually verify it. Read before touching the renderer, bounds, or selection.
6. `prompts/phase-0-core-editor.md` — start building here.
7. `prompts/phase-0.5-core-editor-improvement.md` — where editor work goes *after* P0.
   Open-ended, one batch per design doc; `08-terrain-as-objects.md` is the first and
   `09-selection-across-layers.md` the second.

**Files:**
- `HOW-TO-PROMPT-THE-AGENT.md` — operator's guide: kickoff prompts + build loop.
- `01-system-design.md`, `02-scene-data-model.md`, `03-architecture-decisions.md`,
  `04-geometry-pipeline.md`, `06-frontend-styling.md` — design source of truth.
- `prompts/phase-0..3` — per-phase agent work orders. Phase 0's WP-2/WP-3/WP-4 and the
  terrain half of WP-10 are specified stage-by-stage in `04-geometry-pipeline.md`.
- `prompts/phase-0.5-core-editor-improvement.md` — **the standing work order for editor
  enhancements after P0.** Not a phase: it never closes, packages continue P0's numbering
  from WP-14, and nothing in it blocks P1–P3. Each batch names its own design document.
- `fixtures/` — ready-to-port geometry fixtures (input + property assertions) for the
  highest-risk stages, headlined by the strait test. See `fixtures/README.md`.
- `05-p0-build-checklist.md` — one-page Phase 0 tracker (prototype-first order) that
  doubles as the dev backlog.
- `07-interaction-invariants.md` — **debug log + invariants from the WP-6/WP-7 selection
  work.** Eight rules the sprite renderer, object bounds, hit-testing and cursors have to
  keep in step, the seven bugs that came from breaking them, and the CDP recipe for
  driving real pointer input. Written because a screenshot of seeded state proved nothing
  about interaction.
- `09-selection-across-layers.md` — **built as WP-18 → WP-20 → WP-19** (that order, not the
  numeric one); **the batch is complete.** One Select tool over every layer instead of one at
  a time, the toolbar split so a pointer mode stops looking like a peer of the six layers, and
  then the same frame extended to path-based objects: **rivers first**, because every
  transform is lossless on a river, then land. See ADR-28 and ADR-29.
- `08-terrain-as-objects.md` — **scheduled as WP-14 → WP-17, the first work after P0.**
  Making landmasses selectable, colourable and transformable: the constraints it must
  satisfy, tiers split by which operations are lossless, the overlap policy (default **keep
  apart**), and a replacement for invariant I9. See ADR-25.
- `10-hit-testing-precision.md` — **scheduled as WP-21.** Sprites are picked by their box,
  and the box is a poor stand-in for the shape — measured at 53% ink for mountains and **28%
  for the compass**. Silhouette tie-break, tighter boxes, and a parser that fails loudly.
  See ADR-30.
- `11-editor-shell.md` — **Batch 5, and it ships in two packages** (ADR-40): **WP-23** is §5 —
  ADR-21's generate confirm folded into the generate dialog, an off switch you can actually see,
  and the seed turned into a shareable world code — and **WP-32** is §3–§4, the menu bar and the
  slimmed rail. The right rail stacks five unrelated concerns and **Generate** exists twice;
  commands move to a menu bar and the rail keeps only what you steer while watching the map.
  **WP-30 lands between them**, so no menu item is built and then deleted. See ADR-36 and ADR-40.
- `12-tools-that-say-what-they-do.md` — **scheduled as WP-24 → WP-27.** Four places where a
  tool's behaviour and the UI's description of it have drifted apart: a brush with no feedback
  until you drag, an Erase that means two things and cannot touch landmasses or rivers **at
  all**, a Select that exists twice, and a scatter rotation hardcoded at ±5°. See ADR-37, which
  covers the eraser split only.
- `13-reading-the-map.md` — **scheduled as WP-28 → WP-29.** Three complaints about the finished
  picture rather than the tools: mountains too big for the land they stand on, a zoom floor that
  makes the canvas edge unreachable, and rivers that stop dead at the shore. See ADR-38 (the
  zoom bound widens, amending ADR-02) and ADR-39 (a river's end snaps to a coast or another
  river at draw time, and the mouth reshape is **control points, not stored geometry**).
- `14-routing-and-landing.md` — **scheduled as WP-30 → WP-31**, Batch 8. The editor has no routes
  at all: one URL is the whole address space, a map cannot be linked or bookmarked, and which map
  is open is kept in a localStorage id — the app remembering what an address could say. Adds a
  static landing page at `/` and the SPA under `/maps`, turns the gallery **dialog into a page**,
  and gives map creation a screen — the one place canvas size is free, since changing it later
  empties the map. **None of it needs a host.** See ADR-40, which also removes `New map` and
  `Open Map…` from the menu bar: *the menu owns this map, the gallery owns which map.*
- `HOW-TO-CHANGE-SPRITE-ART.md` — **procedure for replacing or adding the map's artwork.**
  What format the sprites are (SVG path `d` strings, not `.svg` files, and why the theme and
  P1's offline embed both require that), the 100×100 grid with feet on the baseline, and the
  path-dialect conversion step that currently fails silently.
- `../platform/` — **shared infrastructure, not this app's design.** Zitadel, Postgres and
  Caddy are operated for *every* byfauzi app, so they sit in a sibling folder that **moves
  whole to a `byfauzi-infra` repo** when it exists (ADR-34). `README.md` there has the
  topology, the auth decisions (D1–D5) and the migration plan to a consolidated backend;
  `01-zitadel-setup.md` is the paste-ready compose, Caddyfile and app registration. Mandatory
  before P2 WP-1 or WP-2.
- `../DEBT.md` — **the debt ledger**, one level up because it tracks the codebase rather than
  this version's design. Deliberately the *last* of three destinations: shortcuts live as
  `ponytail:` comments in the code, debt with an owner lives in that work package's entry, and
  only what has neither a line nor an owner gets a row. Live — rows are deleted when paid, not
  archived. Carries its own maintenance protocol for agents.
- `ux-wireframe.html` — annotated editor-layout mockup (toolbar / rails / canvas /
  generator + settings), each region keyed to an ADR. Open in a browser or view the
  published Artifact.

**Driving an AI coding agent:**
- **Start with `HOW-TO-PROMPT-THE-AGENT.md`** — the operator's guide with copy-paste
  kickoff prompts, the context bundle to attach, and the build loop to enforce.
- Each file in `prompts/` is a **self-contained work order** for one phase. Hand the
  agent the phase prompt **plus** `01-system-design.md` and `02-scene-data-model.md`
  as context. The phase prompt tells the agent what to build, the constraints, the
  file layout, and the definition of done.
- **Build phases in order.** P0 stands alone (no backend). P1–P3 each assume the
  previous phase shipped.
- Within a phase, follow the **prototype-first order** called out in the prompt —
  the risky geometry pipeline comes before polish.
- The agent must treat `02-scene-data-model.md` as a **hard contract**: the scene
  JSON is the save file, the export source, and the React-library input all at once.
  Never diverge the shape without bumping `schemaVersion` and updating `migrate()`.
- For any package whose acceptance says **click, drag or select**, attach
  `07-interaction-invariants.md` too, and require **driven input** as the evidence. A
  screenshot of state the agent seeded itself demonstrates the renderer, not the feature —
  that mistake shipped a selection tool in which nothing could be selected.

---

## Phase overview

| Phase | Goal | Backend? | Headline deliverables |
|---|---|---|---|
| **P0 — Core editor** | A complete, deployable editor | No | Terrain brush, coastal rings, mountains/forests/icons/rivers, multi-select, undo/redo, noise generator, image export, local-first autosave |
| **0.5 — Core-editor improvement** (ongoing, never closes) | Editor enhancements after P0 | No | **1** terrain as objects (`08`) · **2** selection across layers (`09`) · **3** hit-testing precision (`10`) · **4** more than one map (ADR-33) · **5** the editor shell (`11`) · **6** tools that say what they do (`12`) · **7** reading the map (`13`) · **8** routes and a landing page (`14`). Work order `prompts/phase-0.5-core-editor-improvement.md` |
| **P1 — Distribution** | Get maps out, no server | No | Self-contained HTML embed export, `.map.json` import/export |
| **P2 — Accounts & sharing** | Persistence + hosted sharing | Yes (Go + Postgres + Zitadel) | Login, **opt-in per-map cloud sync** under a server-enforced cap, "my maps", the claim *offer*, share page + hosted iframe, SVG/PDF export (free — client-side) |
| **P3 — React library** | Reusable component | No | `@byfauzi/map-viewer` then `@byfauzi/map-editor` npm packages |

P0 alone is a complete portfolio piece.

---

## Product principles (non-negotiable)

1. **The editor works fully anonymous.** Login only adds cloud persistence — never
   a wall in front of creating/editing/exporting. Stated precisely in **ADR-31**: what
   is free is **everything that runs in the browser** (including unlimited local drafts
   and *every* export format); what is capped is **consumption of the server**. The
   phases are delivery order, not a price ladder.
2. **Everything is an editable object.** Even generated content is ordinary,
   hand-editable geometry. Nothing is locked.
3. **One serializable scene** = save file = export source = React-library input.
4. **Clean seams for SaaS later**, but zero premature scale cost now.

---

## Tech stack (summary — full rationale in `03-architecture-decisions.md`)

| Layer | Choice |
|---|---|
| Frontend | React + Vite (SPA), TypeScript |
| Canvas / vector | react-konva (Konva.js) |
| UI styling | Tailwind v4 + tailwind-variants + CSS-variable tokens + Radix + Lucide |
| State / history | Zustand + a command-stack undo/redo |
| Geometry | `polygon-clipping`, `clipper-lib` (ring offsets), `d3-contour`, `simplify-js`, `simplex-noise`; heavy ops in a Web Worker |
| Spatial index | `rbush` |
| Backend (P2) | Go (chi or echo), `pgx` + `sqlc` |
| DB (P2) | Postgres (scenes as `jsonb`) |
| Auth (P2) | Zitadel (self-hosted), OIDC + PKCE, Google/GitHub/email |
| Storage (SaaS) | S3 / R2 for thumbnails + blobs |
| Packages (P3) | `@byfauzi/map-viewer`, `@byfauzi/map-editor` |

---

## Status

- **v1 design: complete.** All load-bearing decisions locked (see the ADR log).
- **Phase 0: built.** WP-0 … WP-13 all pass their acceptance criteria; the one part not
  done is the deploy itself, which needs a host and a domain. See the tracker.
- **0.5: Batches 1–4 and 6 built**, plus **WP-23** and **WP-28** — so WP-14 … WP-28 all pass their
  acceptance. Batch 6 settled `12` **D4** (the generator keeps its own rotation spread, bumping the
  world code to **`w2-`**) and WP-28 settled `13` **D5** (mountains shrink by changing the shared
  constant, at **100**). **What is left is WP-29 → WP-30 → WP-31 → WP-32**, because ADR-40's routes
  change what the menu bar contains, and **Batch 9's WP-33 is built** (a per-kind placement size for sprites). None of it needs a host.
- **Deferred to a later version:** second (modern) map style, formal object grouping,
  first-class water bodies/canals, auto-generated rivers, rich blended biome
  transitions, tile-render export, WebGL renderer.
