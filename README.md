# map.byfauzi.com

A browser-based vector fantasy-map generator & editor. Paint landmasses with a brush,
get automatic concentric coastal rings, scatter mountains and forests, place icons, draw
rivers, or generate a whole world from noise — then export it.

Design source of truth and per-phase build orders live in
[`architecture/v1/`](architecture/v1/). Start with
[`architecture/v1/README.md`](architecture/v1/README.md); the Phase 0 tracker is
[`05-p0-build-checklist.md`](architecture/v1/05-p0-build-checklist.md), and outstanding
technical debt is [`architecture/DEBT.md`](architecture/DEBT.md).

## Development

```sh
npm install
npm run dev      # editor at http://localhost:5173
npm test         # scene + engine tests (vitest)
npm run lint     # oxlint
npm run build    # typecheck + production bundle
```

## Layout

```
src/
  scene/     scene types (the hard contract), createEmptyScene, migrate, (de)serialize
  engine/    geometry pipeline + the Web Worker that hosts it
```

The scene JSON in [`02-scene-data-model.md`](architecture/v1/02-scene-data-model.md) is a
hard contract — it is the save file, the export source and the React-library input at
once. Every load path runs through `migrate()`, coastal rings are derived and never
stored, and view state is never serialized.
