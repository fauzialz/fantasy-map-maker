# Contributing

Thanks for looking. This project has a fairly opinionated way of working, and most of it
exists because something went wrong once. Reading this first will save you a round of review.

## Before your first pull request

**Sign the CLA.** Add to your PR description:

```
I have read the CLA and agree to it. Signed-off-by: Your Name <your@email>
```

See [`CLA.md`](CLA.md). You keep copyright in what you write; the agreement grants the right
to sublicense, which is what keeps the project's licensing options open. It is a one-time
thing — later PRs don't need it repeated.

## The design documents are the source of truth

Start at [`architecture/v1/README.md`](architecture/v1/README.md). Three files are
load-bearing:

| File | What it is |
|---|---|
| `architecture/v1/02-scene-data-model.md` | **A hard contract.** The scene JSON is the save file, the export source, and the React-library input at once. Never change its shape without bumping `schemaVersion` and shipping the `migrate()` step **in the same commit**. |
| `architecture/v1/03-architecture-decisions.md` | The ADR log — *why* things are the way they are, and what was rejected. Read before changing anything structural. |
| `architecture/v1/07-interaction-invariants.md` | **Mandatory before touching anything pointer-driven.** Eight rules the renderer, bounds, hit-testing and cursors must keep in step, and the seven bugs that came from breaking them. |

If you're proposing something load-bearing, the ADR comes with the code — including the
alternatives you rejected.

## House rules

**One work package per commit**, then tick its box in
`architecture/v1/05-p0-build-checklist.md`.

**Fixtures before wiring**, for anything in the geometry pipeline. `architecture/v1/fixtures/`
has ready-to-port inputs and property assertions for the risky stages — the strait test is the
headline.

**Driven input is the evidence.** For any acceptance criterion that says *click*, *drag* or
*select*, a screenshot of state you seeded yourself proves the renderer, not the feature. That
mistake once shipped a selection tool in which nothing could be selected.
`07-interaction-invariants.md` has the CDP recipe for driving real pointer input.

**Debt has three homes, and the ledger is the last one.** A shortcut tied to a line of code
gets a `ponytail:` comment there (`grep -rn "ponytail:" src/` is the index). Debt that a
planned work package will pay goes into that package's entry, so it becomes an acceptance
criterion instead of a note. Only debt with neither a line nor an owner earns a row in
[`architecture/DEBT.md`](architecture/DEBT.md). A shortcut you can't write a "Retire when" for
isn't debt — it's a decision, so write an ADR.

## Development

```sh
npm install
npm run dev      # editor at http://localhost:5173
npm test         # scene + engine tests (vitest)
npm run lint     # oxlint
npm run build    # typecheck + production bundle
```

Please make sure `npm test`, `npm run lint` and `npm run build` all pass before opening a PR.

## Dependencies

Be conservative about adding them, and **check the licence before you do**. The project is
MIT and intends to stay distributable under permissive terms, so a copyleft dependency is a
blocker, not a detail.

This has already bitten once: `src/engine/terrain/contours.ts` uses `d3-contour` (ISC) rather
than the `marching-squares` package, because that package is AGPL-3.0 and would have forced
the whole app — and the planned `@byfauzi/*` packages — under AGPL. See ADR-32.

The current tree is MIT / ISC / Apache-2.0 / BSD / MPL-2.0 (build-time only) / Boost
(`clipper-lib`) / OFL-1.1 (the fonts), with no GPL-family licence anywhere. Keep it that way.

## Art

Sprites are SVG path `d` strings, not `.svg` files, and the path dialect is narrow — see
[`architecture/v1/HOW-TO-CHANGE-SPRITE-ART.md`](architecture/v1/HOW-TO-CHANGE-SPRITE-ART.md)
before adding or replacing artwork. Contributed art is covered by the same MIT licence and the
same CLA as code.

## Licence

By contributing you agree your work is released under the [MIT Licence](LICENSE) and the terms
of [`CLA.md`](CLA.md).
