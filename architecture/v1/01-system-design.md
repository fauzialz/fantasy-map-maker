# map.byfauzi.com — System Design v1

_Status: complete · Last revised during design interview, 2026-07-21_

## 1. Product in one line

A browser-based, **vector** map editor with a fantasy cartography look — paint
landmasses with a brush, get automatic **concentric coastal "wave" rings**, scatter
mountains/forests, place icons, draw rivers, or **generate a whole world** — then
export as image/embed. **No login wall**; accounts only add cloud persistence later.

## 2. Principles

- **Editor works fully anonymous.** Login is purely for cloud save/sync.
- **Everything is an editable object.** Even generated content is ordinary,
  hand-editable geometry — nothing locked.
- **One serializable scene** = save file = export source = React-library input.
- **Clean seams for SaaS later**, but zero premature scale cost now.

## 3. Scope & phased roadmap

| Phase | Deliverable |
|---|---|
| **P0 — Core editor** (portfolio piece, no backend) | Bounded canvas; terrain area-brush + size; coastal rings; parchment + rings global toggles; mountains & forests (scatter-brush / one-by-one / select-edit-delete / eraser-brush); icons; **rivers (manual spline)**; labels; multi-select; undo/redo; pan/zoom; **noise generator + confirm modal**; **image export PNG/JPG/WebP**; **local-first (IndexedDB) autosave** |
| **P1 — Backend-free distribution** | **Self-contained HTML embed export**; `.map.json` export/import |
| **P2 — Accounts & hosted sharing** | Zitadel auth (Google/GitHub/email); Go API + Postgres; "my maps" gallery; cloud autosave; **claim local drafts on login**; public share page (SSR meta) + **hosted iframe embed**; **SVG/PDF export** |
| **P3 — React library** | `@byfauzi/map-viewer` (read-only render) → `@byfauzi/map-editor` (full editor) |

P0 alone is a complete, deployable app.

## 4. Tech stack

| Layer | Choice |
|---|---|
| Frontend | **React + Vite (SPA)**, TypeScript |
| Canvas/vector | **react-konva (Konva.js)**; scene-graph of shape objects, cached-bitmap layers |
| UI styling | **Tailwind v4 + `tailwind-variants` + CSS-variable tokens + Radix + Lucide** (see `06-frontend-styling.md`) |
| State / history | **Zustand** + **command-stack undo/redo** |
| Geometry | `polygon-clipping` (boolean), `clipper-lib` (ring offsets), `d3-contour` (marching squares), `simplify-js`, `simplex-noise`; heavy ops in a **Web Worker** |
| Spatial index | `rbush` (marquee select / object eraser) |
| Backend (P2) | **Go** (chi/echo), `pgx` + `sqlc` |
| DB (P2) | **Postgres**, scenes as `jsonb` |
| Auth (P2) | **Zitadel** self-hosted, OIDC + PKCE, Google/GitHub/email |
| Storage (SaaS) | S3/R2 for thumbnails/blobs |
| Packages (P3) | `@byfauzi/map-viewer`, `@byfauzi/map-editor` |

## 5. Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (Vite SPA, React + react-konva)                     │
│                                                              │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────┐   │
│  │ Editor engine  │  │ Export module │  │ Auth client (P2) │  │
│  │ Konva scene    │  │ PNG/JPG/WebP  │  │ OIDC + PKCE      │  │
│  │ + command stack│  │ SVG/PDF (P2)  │  └─────────────────┘   │
│  └──────┬────────┘  └───────────────┘                        │
│         │ postMessage                                         │
│  ┌──────▼─────────────────────────┐   ┌──────────────────┐   │
│  │ Geometry Web Worker            │   │ IndexedDB (local  │   │
│  │ boolean / offset / marching-sq │   │ autosave, P0)     │   │
│  └────────────────────────────────┘   └──────────────────┘   │
└───────────┬───────────────────────────────┬─────────────────┘
            │ REST/JSON (Bearer JWT)  [P2]   │ OIDC redirect [P2]
            ▼                                ▼
┌───────────────────────────┐   ┌──────────────────────────┐
│  Go API service  [P2]      │   │  Zitadel (OIDC/OAuth2)[P2]│
│  maps CRUD, thumbnails,    │◄──┤  Google / GitHub / pwd    │
│  share pages (SSR meta),   │   │  issues JWT access tokens │
│  JWT validation via JWKS   │   └──────────────────────────┘
└───────────┬───────────────┘
            ▼
┌───────────────────────────┐   ┌──────────────────────────┐
│  Postgres [P2]             │   │  Object storage (SaaS)    │
│  users, maps(jsonb), shares│   │  thumbnails, large blobs  │
└───────────────────────────┘   └──────────────────────────┘
```

Every arrow is a clean seam. Going SaaS = add a `tenant_id` filter, a billing
service, and move blobs to object storage — no rewrite.

## 6. The scene data model (heart of the system)

The full schema, per-type field tables, and `migrate()` contract live in
`02-scene-data-model.md`. Key points:

- Everything placed is one **discriminated-union object type**, grouped into
  **fixed semantic layers**.
- **Client-generated UUIDs from creation** → idempotent "claim" when the user logs
  in later (P2).
- **`schemaVersion` + a `migrate(scene)` function from day one** — saved files and
  the React lib will outlive schema v1.
- **Coastal rings are never stored** — always derived from the union of landmasses.
  Toggling is instant and can never corrupt data.
- All coordinates are **map-space**, independent of zoom/pan.

## 7. Terrain engine (brush → polygon → rings)

The hardest and most load-bearing part of the app.

**During drag:** stamp the brush into an **offscreen raster mask** (fast; overlap =
free union). Fixed internal resolution, decoupled from zoom, so coastline quality
doesn't change as you zoom.

**On commit (mouse-up):**
1. Threshold the mask → clean land/water regions.
2. **Marching-squares** traces the outer coast + interior holes (lakes).
3. **Chaikin smooth + Douglas–Peucker simplify** — strength driven by a user
   **"coast detail" slider** (default mid). This tames thousands of jagged points.
4. Output: one or more **polygons-with-holes**.

**Integrate into the scene (boolean ops via `polygon-clipping`):**
- Paint **touching existing land** → **union** (single continuous coastline).
- Paint a **detached blob** → a **new, separate landmass** object.
- **Erase / sea brush** → **difference**; can **split** a landmass or **punch a lake**.
- After every op, run **connected-components**: bridged land auto-merges; cut land
  auto-splits into separate objects.
- **Merge/split identity rule: the larger piece keeps the id/name; the smaller gets
  a fresh id and empty name.** (Undo-able toast so nothing feels lost.)

**Water model:** water = **absence of land**. Lakes are holes; an island-in-a-lake is
a land polygon sitting inside another landmass's hole (even-odd fill). The **eraser
IS the sea brush** — one water tool, no mode confusion.

**Coastal rings — one elegant operation:** buffer the **union of all land** outward
in `ringCount` steps (`ringGap` px each). Each step simultaneously expands the coast
**into the ocean** and shrinks lake-holes **into the lakes** → ocean rings and lake
rings from a **single algorithm** (satisfies "rings on ocean + lakes"). Ring _i_ =
`(land grown by i·gap) − (land grown by (i-1)·gap)`, clipped to the water region.
Because it's computed from the **union**, rings between two close islands **merge into
one shared band instead of colliding** — this is the fix for the strait/pinch
artifact. Recomputed on commit only, in the Worker, cached as a bitmap.

**Rivers:** a **separate spline tool** — tapering polyline (wider toward the sea),
**no rings**, rendered above land. Fully decoupled from the boolean engine.

## 8. Scene graph, layers, selection, editing

**Layer stack (render order, bottom → top):**
```
1. Parchment background        (global toggle)
2. Sea fill
3. Coastal hatched rings       (DERIVED, never stored)
4. Terrain / landmass fills
5. Forests
6. Mountains
7. Rivers
8. Icons / landmarks
9. Labels                      (always on top)
```

- **Fixed semantic layers** (not freeform Photoshop layers) — the macro order
  guarantees the map always reads correctly. Each layer has **visibility + lock**.
- **Each semantic layer is its own "group."** Inside a layer:
  **intra-layer z-order = auto-by-Y (lower on map = in front), tie-break by scale
  (bigger = front), with manual bring-forward / send-back per object.** This is how
  "make this bigger tree sit in front of the others" works in one click.
- **Scatter brush** = sample points along the stroke, instantiate N objects with
  jittered scale/variant/rotation. **One-by-one placement** = one object per click.
  Scattered objects are **independent** (no formal grouping in v1).
- **Selection = multi-select** (marquee drag + shift-click), backed by an **rbush**
  spatial index so it stays fast with 1–2k objects.
- **Contextual eraser:** "erase" removes whatever the active tool creates. On Terrain
  it edits land geometry (sea brush); on Mountains/Forests/Icons it's an
  **object-eraser brush** (drag to remove objects under it). Plus click-select →
  Delete. (Satisfies "direct delete" two ways.)

## 9. Rendering & performance architecture

- **Active layer = live nodes; every other layer = a cached bitmap** (`layer.cache()`).
  While painting or dragging, only one layer redraws → smooth at 1–2k objects.
- **Cache layers at viewport/display resolution, NOT full-map resolution.** Six
  full-map RGBA bitmaps at 4000×3000 ≈ 290 MB and crash mobile Safari; caching at
  what's on screen keeps memory in the tens of MB. Regenerate cache on zoom change.
- **Heavy geometry runs in a Web Worker** (boolean, offset, marching-squares),
  debounced, on stroke-commit — main thread never stalls.
- **rbush** spatial index for marquee-select + object-eraser hit-testing (O(log n)).
- **Sprite cache:** hand-drawn mountain/tree/icon SVGs rasterized **once per variant**
  into an in-memory cache and drawn as images. Originals kept for the SVG export path.
- **Canvas presets:** Landscape 4000×3000 · Square 3000×3000 · Portrait 3000×4000,
  chosen at map creation. Bounded (no infinite zoom); zoom clamped to a min/max.
- **Perf budget: ~1,000–2,000 objects** smooth on Konva 2D with the cache strategy.
  WebGL/PixiJS is the **noted escape hatch** only if maps ever get far denser.

## 10. Generator (noise → world)

- **Simplex fields:** elevation + moisture (+ a latitude/temperature gradient).
- Threshold elevation → land/water mask → **feed the exact same commit path as the
  brush** (marching-squares → smooth → simplify) → landmasses + rings for free.
- **Auto-scatter mountains** on high-elevation ridges; **forests** on mid-elevation /
  high-moisture; **auto-assign biome** per region from elevation × moisture × latitude.
- **Biome set (v1):** grassland, forest, desert, snow, swamp.
- **Populates:** terrain + mountains + forests (Decision B1(b)). No icons/labels
  (personal), **no auto-rivers** (draw by hand).
- **Controls:** Land amount, Roughness, Seed / re-roll — **plus an Advanced drawer**
  (sea level, mountain density, forest density, world type: single continent /
  archipelago / multiple continents).
- **Object counts capped & density-thinned (Poisson-disk) to stay within the perf
  budget**; **speck islands filtered** by a min-area threshold.
- **Seed stored as metadata only**; the generator's output is concrete, fully-editable
  geometry (never regenerated from seed at load time).
- Runs in the Worker; **replaces the canvas behind a confirm modal** when the canvas
  isn't empty; the whole replace is **one undoable command**.

## 11. Export & distribution

| Format | Phase | Note |
|---|---|---|
| PNG (default) | P0 | `stage.toDataURL()` at export scale |
| JPG | P0 | **flatten onto a background color** (no alpha) |
| WebP | P0 | smallest; recommend as the "web" option |
| Self-contained HTML embed | P1 | single `.html`, scene + viewer inlined, backend-free |
| `.map.json` | P1 | portable, re-importable source |
| SVG | P2 | vector model makes this clean |
| PDF | P2 | via SVG; print-friendly large maps |
| Hosted share link + iframe | P2 | needs the store; SSR **escaped** `<meta>`/OG + thumbnail |

**Export-resolution clamp (P0 gotcha):** a 4000×3000 canvas at 4× = 192 MP and
exceeds browser canvas limits (~16k px/side), returning **blank or throwing**. Clamp
export scale to a safe cap and **warn** if the user's pick was capped. **Tile-render +
stitch** for poster-size is the noted upgrade path.

## 12. Auth, backend & persistence (P2)

- **Zitadel** (Go, OIDC-first, multi-tenant, self-hosted). SPA uses **Auth Code +
  PKCE** (no client secret in the browser). Go validates JWTs against Zitadel's
  **JWKS** — no server session store. Handle **token refresh** so long editing
  sessions don't 401 mid-save. Other apps reuse the same IdP by registering each as
  its own OIDC client.
- **Go API surface:**
  ```
  GET    /api/maps                 list my maps (id, title, thumb, updatedAt)
  POST   /api/maps                 create (returns id)
  GET    /api/maps/{id}            full scene JSON
  PUT    /api/maps/{id}            save/update (scene JSON) + optimistic version check
  DELETE /api/maps/{id}
  POST   /api/maps/{id}/thumbnail  store rendered PNG thumb
  POST   /api/maps/{id}/share      create/rotate public share slug
  GET    /s/{slug}                 SSR HTML shell + escaped OG meta (public share)
  GET    /embed/{slug}             minimal iframe page (viewer only)
  ```
- **Postgres (starter):**
  ```sql
  users(  id uuid pk,            -- mirrors Zitadel sub
          email text, display_name text, created_at )
  maps(   id uuid pk, owner_id uuid fk,
          tenant_id uuid null,   -- nullable NOW so multi-tenant is a filter later
          title text, style text,
          scene jsonb, thumb_url text,
          created_at, updated_at )
  shares( slug text pk, map_id uuid fk, is_public bool, created_at )
  ```
- **Local-first:** IndexedDB autosave for anonymous users (P0). On login, **claim**
  local drafts by their client UUID (idempotent — no duplicates if they log in
  mid-session). Cloud autosave **debounced**; **optimistic version check** on `PUT`
  (`updated_at`) to avoid two-tab clobber.
- **Security:** the SSR share page injects user-supplied title/description into HTML
  `<meta>` — **escape it** (OG/HTML injection). Canvas-rendered labels are safe since
  Konva draws text to canvas, not the DOM.

## 13. Undo/redo command model

Command stack (Zustand). **One brush stroke / one scatter-drag / one generate = one
undo step.**

| Command | Undo payload |
|---|---|
| PaintLand / EraseSea | before/after polygons of **only the affected landmass(es)** |
| Place / Scatter | ids of the created objects |
| Transform / EditProps | per-object before/after deltas |
| Delete | the removed objects (to restore) |
| **Generate** | the **entire previous scene** (atomic; reversible even past the confirm) |
| Toggle setting | previous value |

## 14. Prototype-first order (highest risk → lowest)

1. **Brush → clean editable polygon** — raster mask → marching-squares → smooth/
   simplify → boolean union/difference → split/merge. The load-bearing wall.
2. **Coastal rings** — buffer the land union, clip to water (validates the signature
   look + the strait fix).
3. **Scatter-then-edit ergonomics** at 1–2k objects with cached layers (validates the
   perf strategy).
4. **Generator** — reuses #1–#2.

## 15. Deferred / not in v1

Second (modern) map style · formal object grouping · first-class water bodies &
canals · auto-generated rivers · rich blended biome transitions · tile-render export ·
WebGL renderer.
