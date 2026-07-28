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
5. `prompts/phase-0-core-editor.md` — start building here.

**Files:**
- `HOW-TO-PROMPT-THE-AGENT.md` — operator's guide: kickoff prompts + build loop.
- `01-system-design.md`, `02-scene-data-model.md`, `03-architecture-decisions.md`,
  `04-geometry-pipeline.md`, `06-frontend-styling.md` — design source of truth.
- `prompts/phase-0..3` — per-phase agent work orders. Phase 0's WP-2/WP-3/WP-4 and the
  terrain half of WP-10 are specified stage-by-stage in `04-geometry-pipeline.md`.
- `fixtures/` — ready-to-port geometry fixtures (input + property assertions) for the
  highest-risk stages, headlined by the strait test. See `fixtures/README.md`.
- `05-p0-build-checklist.md` — one-page Phase 0 tracker (prototype-first order) that
  doubles as the dev backlog.
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

---

## Phase overview

| Phase | Goal | Backend? | Headline deliverables |
|---|---|---|---|
| **P0 — Core editor** | A complete, deployable editor | No | Terrain brush, coastal rings, mountains/forests/icons/rivers, multi-select, undo/redo, noise generator, image export, local-first autosave |
| **P1 — Distribution** | Get maps out, no server | No | Self-contained HTML embed export, `.map.json` import/export |
| **P2 — Accounts & sharing** | Persistence + hosted sharing | Yes (Go + Postgres + Zitadel) | Login, cloud save, "my maps", claim local drafts, share page + hosted iframe, SVG/PDF export |
| **P3 — React library** | Reusable component | No | `@byfauzi/map-viewer` then `@byfauzi/map-editor` npm packages |

P0 alone is a complete portfolio piece.

---

## Product principles (non-negotiable)

1. **The editor works fully anonymous.** Login only adds cloud persistence — never
   a wall in front of creating/editing/exporting.
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
| Geometry | `polygon-clipping`, Clipper/`polygon-offset`, `marching-squares`, `simplify-js`, `simplex-noise`; heavy ops in a Web Worker |
| Spatial index | `rbush` |
| Backend (P2) | Go (chi or echo), `pgx` + `sqlc` |
| DB (P2) | Postgres (scenes as `jsonb`) |
| Auth (P2) | Zitadel (self-hosted), OIDC + PKCE, Google/GitHub/email |
| Storage (SaaS) | S3 / R2 for thumbnails + blobs |
| Packages (P3) | `@byfauzi/map-viewer`, `@byfauzi/map-editor` |

---

## Status

- **v1 design: complete.** All load-bearing decisions locked (see the ADR log).
- **Deferred to a later version:** second (modern) map style, formal object grouping,
  first-class water bodies/canals, auto-generated rivers, rich blended biome
  transitions, tile-render export, WebGL renderer.
