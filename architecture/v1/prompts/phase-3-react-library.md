# Phase 3 — React Library · Agent Work Order

> **You are an AI coding agent.** Package the rendering (and later the editing) core as
> reusable npm libraries so React developers can drop maps into their own apps. Ship in
> two tiers: the **viewer** first (small, high-value), then the **editor**.

## Required reading
- `../01-system-design.md` §9 (rendering), §11 (distribution/library).
- `../02-scene-data-model.md` — the scene JSON is the library's public input; `migrate()`
  is part of the contract.
- `../03-architecture-decisions.md` — ADR-03 (Konva), ADR-04 (React), ADR-23 (schema
  versioning).
- `phase-1-distribution.md` WP-1 — the read-only `MapViewer` you extracted is the seed
  of the viewer package.

## Definition of done for Phase 3
Two published packages: **`@byfauzi/map-viewer`** (render a scene, read-only,
interactive pan/zoom) and **`@byfauzi/map-editor`** (the full editor as a component),
both consuming the same scene JSON, versioned against `schemaVersion`, documented, with
a demo.

## Hard constraints
- **React is a peer dependency**; Konva ships as a dependency. Tree-shakeable ESM +
  CJS builds; typed (`.d.ts`).
- **Do not fork the renderer.** The app and both packages share one rendering core —
  extract it into an internal package/module the app also consumes.
- **`migrate(scene)` runs on input** so old saved maps render in any consumer.
- **Version-lock to `schemaVersion`.** The package documents which schema versions it
  accepts and migrates.

## Work packages

### WP-1 · Extract the shared rendering core
- Move the render engine (Konva scene building, ring derivation, sprite registry,
  `migrate`, scene types) into an internal shared module consumed by the app **and** the
  packages. The main app must switch to consuming it with no visual change.
- **Acceptance:** the production app renders identically after the extraction; no
  duplicated renderer code remains.

### WP-2 · `@byfauzi/map-viewer`
- Public API (minimum):
  ```tsx
  <MapViewer
    scene={sceneJsonOrUrl}
    interactive?          // pan/zoom on/off
    fit?                  // "contain" | "cover" | "width"
    onReady?, onError? />
  ```
- Accepts a scene object **or** a URL to a `.map.json`; runs `migrate()`; renders with
  derived rings + sprites. Read-only. SSR-safe (guards `window`/canvas).
- Build ESM+CJS, types, minimal CSS, a README with usage + a live demo (e.g. a small
  Vite example app in the repo).
- **Acceptance:** a fresh React app installs the package and renders a map from JSON and
  from a URL; interactive toggle works; bundle size is documented and lean (Konva is the
  floor).

### WP-3 · `@byfauzi/map-editor`
- The full editor as a component:
  ```tsx
  <MapEditor
    initialScene?, onChange?(scene), onSave?(scene),
    tools?, theme? />
  ```
- Controlled/uncontrolled scene support; exposes save/export hooks; consumers can host
  their own persistence. Reuse all P0 tools via the shared core.
- **Acceptance:** a host app embeds the editor, receives `onChange` scene updates, and
  can persist them itself; feature-parity with the app's own editor.

### WP-4 · Versioning, docs, release
- Semver; a compatibility table (package version ↔ accepted `schemaVersion`); changelog;
  migration notes. Automated build/publish.
- **Acceptance:** both packages publish; docs let a new dev integrate the viewer in
  minutes and the editor without reading the source.

## Gotchas
- **Style isolation (see `../06-frontend-styling.md`):** ship the library build with
  **Preflight disabled** (split Tailwind imports, omit `preflight.css`) and the `mbf:`
  prefix so the package never resets or collides with a host app. Wrap the editor in
  `.mbf-root` and include a small scoped reset. Host *global* styles bleeding into our
  subtree is a documented v1 limitation — **Shadow DOM is the optional full-isolation
  upgrade here** if a consumer needs it.
- **Peer deps:** React (and matching react-dom) as peers to avoid duplicate-React bugs;
  Konva bundled but tree-shakeable.
- **SSR:** guard all browser/canvas access; the viewer must not crash in Next.js SSR.
- **Schema drift:** always `migrate()` at the boundary; document accepted versions; never
  silently render a newer-than-supported scene.
- **Asset delivery:** decide how sprites/textures ship (bundled vs configurable asset
  base URL) and document it; keep the default self-contained.

## Out of scope for Phase 3
New editor features beyond P0–P2, the second (modern) style, WebGL renderer, formal
object grouping (all deferred to a later version).
