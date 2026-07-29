# map.byfauzi.com — Scene Data Model v1

_The single most important contract in the system. The scene JSON is the save file,
the export source, and the React-library input all at once. Treat this as a hard
contract: never change the shape without bumping `schemaVersion` and updating
`migrate()`._

## 1. Top-level shape

```jsonc
{
  "schemaVersion": 1,

  "meta": {
    "id": "client-uuid",             // generated at creation, client-side (idempotent claim)
    "title": "The Sundered Coast",
    "style": "fantasy",              // only "fantasy" in v1; "modern" is deferred
    "canvas": {
      "preset": "landscape",         // "landscape" | "square" | "portrait"
      "w": 4000,
      "h": 3000
    },
    "createdAt": "2026-07-21T00:00:00Z",
    "updatedAt": "2026-07-21T00:00:00Z"
  },

  "settings": {
    "parchment": true,               // global background texture toggle
    "coastalRings": true,            // global rings toggle
    "ringCount": 4,
    "ringGap": 14,                   // px between rings, in map-space
    "coastDetail": 0.5               // 0 = very smooth/stylized, 1 = rough/natural
  },

  "generator": {                     // METADATA ONLY — never re-run at load time
    "seed": 123456,
    "landAmount": 0.45,
    "roughness": 0.6,
    "worldType": "single"            // "single" | "archipelago" | "multiple"
  },

  "layers": [ /* see §3 — fixed set, fixed order */ ]
}
```

### Rules
- **All coordinates are map-space** (0..canvas.w, 0..canvas.h), independent of
  zoom/pan. Rendering applies a map→screen transform.
- **`meta.id` is a client-generated UUID** created the moment a map is created,
  before any server exists. This makes the P2 "claim local draft → cloud" flow
  idempotent.
- **`generator` is metadata only.** The generator's *output* is concrete geometry
  written into `layers`. Never regenerate from the seed at load time (noise-library
  versions drift; stored geometry is the truth).
- **Coastal rings are NOT stored.** They are derived at render time from the union of
  all landmass objects. `settings.coastalRings/ringCount/ringGap` only parameterize
  the derivation.

## 2. Object base type

Every placed object shares this base:

```jsonc
{
  "id": "uuid",          // client-generated, unique within the scene
  "type": "mountain",    // discriminator (see §4)
  "x": 0, "y": 0,        // map-space position (path-based types omit x/y)
  "rotation": 0,         // degrees
  "scale": 1,            // uniform scale multiplier
  "z": 0                 // manual z-order override within the layer (see §5)
}
```

## 3. Layers (fixed set, fixed order)

The layer array is a **fixed semantic set in a fixed render order**. Do not add
freeform user layers in v1.

```jsonc
"layers": [
  { "id": "terrain",   "kind": "terrain",  "visible": true, "locked": false, "objects": [ /* landmass */ ] },
  { "id": "forests",   "kind": "forest",   "visible": true, "locked": false, "objects": [ /* tree    */ ] },
  { "id": "mountains", "kind": "mountain", "visible": true, "locked": false, "objects": [ /* mountain */ ] },
  { "id": "rivers",    "kind": "river",    "visible": true, "locked": false, "objects": [ /* river    */ ] },
  { "id": "icons",     "kind": "icon",     "visible": true, "locked": false, "objects": [ /* landmark */ ] },
  { "id": "labels",    "kind": "label",    "visible": true, "locked": false, "objects": [ /* label    */ ] }
]
```

Render order (bottom → top): parchment (setting) → sea fill → **derived rings** →
terrain → forests → mountains → rivers → icons → labels.

## 4. Object types (discriminated union)

### `landmass` (terrain layer)
```jsonc
{
  "id": "lm1", "type": "landmass",
  "path": [[x,y], ...],       // closed outer boundary (coastline), CCW
  "holes": [ [[x,y], ...], ...],  // inner boundaries = lakes (CW), even-odd fill
  "biome": "grassland"        // grassland | forest | desert | snow | swamp
}
```
- Produced by the terrain engine (brush commit or generator). No `x/y/rotation/scale`
  — geometry is absolute.
- Multiple disjoint landmasses = multiple objects. Merge/split handled by boolean ops
  + connected-components; **the larger piece keeps the id/name on split or merge.**

### `tree` (forest layer)
```jsonc
{ "id": "t1", "type": "tree", "x": 900, "y": 1200, "rotation": 0, "scale": 1, "z": 0, "variant": 2 }
```
- The scatter unit for forests. `variant` selects a hand-drawn sprite.

### `mountain` (mountains layer)
```jsonc
{ "id": "m1", "type": "mountain", "x": 1200, "y": 800, "rotation": 0, "scale": 1, "z": 5, "variant": 3 }
```

### `river` (rivers layer) — path-based, omits x/y
```jsonc
{ "id": "r1", "type": "river", "points": [[x,y], ...], "width": 12, "taper": true, "z": 0 }
```
- Rendered as a tapering polyline (wider toward the sea). **No coastal rings.**

### `landmark` (icons layer)
```jsonc
{ "id": "i1", "type": "landmark", "x": 900, "y": 1100, "rotation": 0, "scale": 1, "z": 0, "kind": "castle" }
```
- `kind`: castle | city | town | tower | ruin | compass | ship | monster | … (extend
  the icon set freely; `kind` is an open string keyed to the sprite registry).

### `label` (labels layer)
```jsonc
{ "id": "L1", "type": "label", "x": 800, "y": 950, "rotation": 0, "scale": 1, "z": 0,
  "text": "Mirkwood", "font": "fantasy-serif", "size": 42, "pathId": null }
```
- `pathId` (optional, future): id of a curve to run the text along. `null` = straight.

## 5. Z-order semantics (within a layer)

Effective draw order inside a layer is computed, not just the array order:

1. **Default: sort by Y** (greater `y` = drawn later = in front).
2. **Tie-break by `scale`** (larger = in front).
3. **Manual override:** the object's `z` field bumps it forward/back explicitly
   (bring-forward / send-back UI actions set `z`).

Rule of thumb: `effectiveOrder = (z, y, scale)` compared in that priority.

## 6. `migrate(scene)` contract

- A pure function `migrate(scene): Scene` runs on **every load** (local draft, cloud
  fetch, `.map.json` import, React-library input).
- It upgrades any `schemaVersion < CURRENT` to the current shape, step by step
  (`1→2→3…`), and is a no-op when already current.
- **Every schema change ships with its migration step in the same commit.** Never
  read a raw scene without passing it through `migrate()` first.
- Unknown future fields must be preserved where possible (forward-compat), or the
  migration must explicitly drop and document them.

## 7. What is NOT in the scene

- **Coastal rings** — derived from the land union at render time.
- **Sprite bitmaps** — the scene stores `variant`/`kind` keys; sprites come from the
  app's asset registry.
- **View state** (zoom, pan, active tool, selection) — session-only, never serialized
  into the saved scene.
- **Undo history** — session-only.
- **The generator's advanced knobs** (sea-level override, mountain density, forest density) —
  session-only. §1 lists `seed`, `landAmount`, `roughness`, `worldType` and nothing else;
  the schema is a hard contract, so persisting more means a `schemaVersion` bump and a
  migration step. Anything the advanced drawer grows must make that trade explicitly.
