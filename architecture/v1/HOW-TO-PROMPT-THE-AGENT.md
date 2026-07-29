# How to Prompt the AI Agent

A practical operator's guide for driving an AI coding agent through the build using the
docs in this folder. Read this once; then use the copy-paste kickoff prompts below.

---

## The mental model

- These docs are the **spec**; the agent writes the **code**. You are the **operator**:
  you attach the right context, keep the agent to one work package at a time, and check
  each package against its acceptance criteria before moving on.
- **Build phases in order** (P0 → P1 → P2 → P3). Within a phase, follow the work-package
  order — it is prototype-first (risky geometry before polish).
- **The scene JSON (`02-scene-data-model.md`) is law.** The geometry stages
  (`04-geometry-pipeline.md`) are built **stage-by-stage, fixtures first.**

## The context bundle to attach (every session)

Always give the agent:
1. The **phase prompt** you're working on (`prompts/phase-N-*.md`).
2. `01-system-design.md` and `02-scene-data-model.md` (the system + the data contract).
3. For P0 terrain/rings/generator work: `04-geometry-pipeline.md` **and** `fixtures/`.
4. `05-p0-build-checklist.md` so it (and you) can track progress.

For a **core-editor improvement** package (WP-14 onward), attach instead:
`prompts/phase-0.5-core-editor-improvement.md`, the batch's design document (e.g.
`08-terrain-as-objects.md`), `07-interaction-invariants.md`, and the same scene contract.

Keep `03-architecture-decisions.md` handy — when the agent proposes something that
contradicts a decision, point it at the relevant ADR.

## The build loop (enforce this every work package)

For each WP:
1. **Scope** — "Do only WP-N. Do not start WP-N+1."
2. **Build** — the agent implements it.
3. **Prove** — geometry WPs: make the stage's fixtures pass. Other WPs: demonstrate the
   acceptance criteria from the phase prompt.
4. **Review** — you check it against the acceptance criteria; reject if unmet.
5. **Commit** — one WP per commit, then tick the box in `05-p0-build-checklist.md`.
6. **Next** — move to the next WP.

Small, verified steps beat a big blob you have to debug backwards.

---

## Kickoff prompt — Phase 0 (copy, paste, attach the bundle)

```
You are building Phase 0 of map.byfauzi.com, a browser-based fantasy map editor.

Context (attached): prompts/phase-0-core-editor.md, 01-system-design.md,
02-scene-data-model.md, 04-geometry-pipeline.md, the fixtures/ folder, and
05-p0-build-checklist.md.

Rules:
- Follow the work packages in phase-0-core-editor.md IN ORDER. Do only the work
  package I name; do not jump ahead.
- The scene JSON in 02-scene-data-model.md is a hard contract. Every load path runs
  through migrate(). View state is never serialized. Coastal rings are derived, never
  stored.
- Build the terrain/rings/generator packages (WP-2, WP-3, WP-4, WP-10) stage-by-stage
  against 04-geometry-pipeline.md, and make each stage pass its fixtures (port the
  fixtures/ files into the engine test suite) BEFORE composing stages.
- Stack: React + Vite + TypeScript, react-konva, Zustand + a command-stack for undo,
  a Web Worker for heavy geometry. No backend, no auth, no network — persistence is
  IndexedDB only.
- Perf budget: smooth at ~1–2k objects. Active layer live; other layers cached at
  VIEWPORT resolution (never full-map resolution). Heavy geometry off the main thread.

Start with WP-0 (scaffold). Confirm the plan for WP-0 in 2–3 lines, then implement it,
show me it meets its acceptance criteria, commit, and stop for my review before WP-1.
```

Then, for each subsequent package, a one-liner is enough:

```
WP-2 next. Build it stage-by-stage against 04-geometry-pipeline.md Pipeline A (S1–S9),
passing each stage's fixtures before wiring them. Stop after the S9 fixtures pass.
```

## Prompting the geometry stages (the part that needs discipline)

Treat it as test-driven development:
```
Implement stage S2 (maskToContours) from 04-geometry-pipeline.md. First port
fixtures/s2-contours.fixture.json into the engine test suite and implement the
assertion evaluator described in fixtures/README.md. Make S2 pass its three cases
(circle, donut, two-blobs) before moving on. Don't touch S3 yet.
```
For rings, always call out the make-or-break test:
```
Implement Pipeline C (S10–S14). The strait fixture (fixtures/strait.fixture.json) is
the acceptance gate: its assertions (single component in the channel, coverage <= 1,
land never covered) must pass. Show me the strait fixture green.
```

## Guardrails — remind the agent when it drifts

- **"Check the ADR."** If a suggestion conflicts with `03-architecture-decisions.md`
  (e.g. storing rings, freeform layers, a login wall, floats into Clipper), cite the ADR
  and have it revert.
- **"One package at a time."** If it starts scaffolding future features, pull it back.
- **"Fixtures first."** If it wires geometry stages together before they pass in
  isolation, stop and require the isolated fixtures.
- **"Don't over-build the UI."** The UI/export/persistence packages are intentionally
  coarse in the prompt — let the agent implement them idiomatically; don't invite it to
  gold-plate.

## Core-editor improvements (WP-14 onward)

`prompts/phase-0.5-core-editor-improvement.md` is **not a phase** — it stays open, and it is
where editor work goes once P0's file is frozen. It does not block P1, and P1 does not block
it; pick up a batch whenever it is worth more than the next phase.

```
Build WP-14 per prompts/phase-0.5-core-editor-improvement.md (Batch 1, terrain as
objects). Read 08-terrain-as-objects.md in full first, and 07-interaction-invariants.md.
Settle decisions D1, D4 and D6 with me before writing code. Landmasses are path-based:
hit-test by path, never by bounding box, and do NOT give them a footprint. No transform
handles in WP-14. Acceptance is driven pointer input, not a screenshot.
```

## Later phases (short kickoffs)

- **P1:** "Build Phase 1 per prompts/phase-1-distribution.md. Reuse the Phase 0 render
  core — extract a read-only MapViewer, don't fork the renderer. Everything client-side;
  the embed must work offline with no external requests."
- **P2:** "Build Phase 2 per prompts/phase-2-accounts-persistence.md. No login wall —
  gate only cloud features. Go + Postgres + Zitadel (OIDC + PKCE, JWKS validation).
  Claim local drafts by meta.id. Escape all user text in share-page meta."
- **P3:** "Build Phase 3 per prompts/phase-3-react-library.md. Extract the shared render
  core first; React as a peer dep; run migrate() on all input; ship the viewer package
  before the editor package."

## Definition of "phase done"

Every work package's acceptance criteria met, every box in the relevant checklist
ticked, and — for P0 — the "Phase 0 done when…" bar in `05-p0-build-checklist.md`
satisfied. Then move to the next phase.

**Core-editor improvements are done per package, not per phase.** There is no "0.5 done"
bar: a package passes its own acceptance criteria, gets its box ticked, and the file stays
open for the next batch.
