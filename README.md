# map.byfauzi.com

A browser-based vector fantasy-map generator & editor. Paint landmasses with a brush,
get automatic concentric coastal rings, scatter mountains and forests, place icons, draw
rivers, or generate a whole world from noise — then export it.

Design source of truth and per-phase build orders live in
[`architecture/v1/`](architecture/v1/). Start with
[`architecture/v1/README.md`](architecture/v1/README.md); the Phase 0 tracker is
[`05-p0-build-checklist.md`](architecture/v1/05-p0-build-checklist.md), and outstanding
technical debt is [`architecture/DEBT.md`](architecture/DEBT.md).

MIT licensed — see [`LICENSE`](LICENSE), and ADR-32 in
[`architecture/v1/03-architecture-decisions.md`](architecture/v1/03-architecture-decisions.md)
for why. Contributions welcome: start with [`CONTRIBUTING.md`](CONTRIBUTING.md), which links
the one-time [CLA](CLA.md).

## Development

```sh
npm install
npm run dev      # editor at http://localhost:5173
npm test         # scene + engine tests (vitest)
npm run lint     # oxlint
npm run build    # typecheck + production bundle
```

## Deploying

`npm run build` emits a completely static `dist/` — no server, no API, no environment
variables, and a single route, so it needs no SPA rewrite rules. Upload `dist/` to any
static host or CDN (Netlify, Cloudflare Pages, GitHub Pages, S3+CloudFront):

```sh
npm run build
npx serve dist        # or any static server, to check the bundle before shipping
```

Two things the host must get right: serve `.woff2` with a long cache lifetime (the fonts
are content-hashed and self-hosted — there is no CDN fallback), and do not add a
Content-Security-Policy that blocks `worker-src blob:`, which the geometry worker needs.

## Layout

```
src/
  scene/        scene types (the hard contract), createEmptyScene, migrate, (de)serialize
  engine/       geometry pipeline + the Web Worker that hosts it
  canvas/       Konva stage, layers, viewport, and draw.ts — every mark on the map
  ui/           the chrome: toolbar, rails, dialogs, and the tailwind-variants styles
  export/       PNG/JPG/WebP export with the resolution clamp
  persistence/  IndexedDB autosave and restore
  styles/       design tokens, light and dark
```

The scene JSON in [`02-scene-data-model.md`](architecture/v1/02-scene-data-model.md) is a
hard contract — it is the save file, the export source and the React-library input at
once. Every load path runs through `migrate()`, coastal rings are derived and never
stored, and view state is never serialized.
