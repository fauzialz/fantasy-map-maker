# CLAUDE.md

Design source of truth is `architecture/v1/` — start at its `README.md`. The scene JSON in
`architecture/v1/02-scene-data-model.md` is a hard contract; `03-architecture-decisions.md` is
the ADR log; `07-interaction-invariants.md` is mandatory reading before touching anything
pointer-driven.

`architecture/platform/` is **not this app's design** — it holds infrastructure shared with
other byfauzi apps (Zitadel, Postgres, Caddy) and **moves to a `byfauzi-infra` repo** when
that exists (ADR-34). Read it before any auth or backend work; never build an IdP service in
this repo. Keep it free of imports from `v1/`, and `v1/` free of imports from it, so the move
stays one `git mv`.

## Debt

`architecture/DEBT.md` is the single home for technical and code debt.

**Whenever the user raises tech debt, code debt, shortcuts, "TODO", "for now", "we'll fix it
later", or asks what is outstanding or unfinished: read `architecture/DEBT.md` first, then
update it in the same turn.** Its "For the AI agent" section holds the protocol. Follow it
rather than inventing a format, and answer from the file and the code rather than from memory.

The ledger is the **last** of three destinations, and deliberately small. Debt belonging to a
line in the code goes in a `ponytail:` comment there (`grep -rn "ponytail:" src/` is the
index); debt with a work package that will pay it goes into that package's entry in
`architecture/v1/05-p0-build-checklist.md`, so it becomes an acceptance criterion instead of a
note; only debt with neither a line nor an owner gets a row. A shortcut you cannot write a
"Retire when" for is a decision, not debt — write an ADR instead.

## Working habits this repo expects

- One work package per commit, then tick its box in `architecture/v1/05-p0-build-checklist.md`.
- Fixtures before wiring, for anything in the geometry pipeline.
- For acceptance criteria that say click, drag or select: **driven input is the evidence.** A
  screenshot of state you seeded yourself proves the renderer, not the feature.
