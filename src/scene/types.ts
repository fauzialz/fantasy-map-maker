/**
 * Scene data model — verbatim from `architecture/v1/02-scene-data-model.md`.
 * This is a hard contract: the scene JSON is the save file, the export source and the
 * React-library input at once. Never change a shape without bumping
 * CURRENT_SCHEMA_VERSION and adding the matching step in `migrate()`.
 */

export const CURRENT_SCHEMA_VERSION = 1;

export type Point = [number, number];
/** Closed ring of map-space points. Outer rings CCW, holes CW (even-odd fill). */
export type Ring = Point[];

export type CanvasPreset = "landscape" | "square" | "portrait";
export type Biome = "grassland" | "forest" | "desert" | "snow" | "swamp";
export type WorldType = "single" | "archipelago" | "multiple";

/** Every object placed at a point. Path-based types (landmass, river) omit x/y. */
export interface PlacedBase {
  id: string;
  /** map-space position */
  x: number;
  y: number;
  /** degrees */
  rotation: number;
  /** uniform scale multiplier */
  scale: number;
  /** manual z-order override within the layer; effective order = (z, y, scale) */
  z: number;
}

/** terrain layer — absolute geometry, no transform of its own. */
export interface Landmass {
  id: string;
  type: "landmass";
  /** closed outer boundary (coastline), CCW */
  path: Ring;
  /** inner boundaries = lakes, CW */
  holes: Ring[];
  biome: Biome;
}

export interface Tree extends PlacedBase {
  type: "tree";
  variant: number;
}

export interface Mountain extends PlacedBase {
  type: "mountain";
  variant: number;
}

/** rivers layer — path-based, omits x/y. Tapering polyline, never gets coastal rings. */
export interface River {
  id: string;
  type: "river";
  points: Point[];
  width: number;
  taper: boolean;
  z: number;
}

export interface Landmark extends PlacedBase {
  type: "landmark";
  /** open string keyed to the sprite registry: castle | city | tower | ruin | … */
  kind: string;
}

export interface Label extends PlacedBase {
  type: "label";
  text: string;
  font: string;
  size: number;
  /** id of a curve to run the text along; null = straight (reserved for a later version) */
  pathId: string | null;
}

export type SceneObject = Landmass | Tree | Mountain | River | Landmark | Label;

export type LayerId = "terrain" | "forests" | "mountains" | "rivers" | "icons" | "labels";
export type LayerKind = "terrain" | "forest" | "mountain" | "river" | "icon" | "label";

// ponytail: one Layer type over the union rather than a layer-per-kind generic — narrow
// at the few call sites that care until per-layer typing actually catches something.
export interface Layer {
  id: LayerId;
  kind: LayerKind;
  visible: boolean;
  locked: boolean;
  objects: SceneObject[];
}

export interface SceneMeta {
  /** client-generated UUID, created before any server exists (idempotent P2 claim) */
  id: string;
  title: string;
  /** only "fantasy" in v1; "modern" is deferred */
  style: "fantasy";
  canvas: { preset: CanvasPreset; w: number; h: number };
  createdAt: string;
  updatedAt: string;
}

export interface SceneSettings {
  parchment: boolean;
  coastalRings: boolean;
  ringCount: number;
  /** px between rings, in map-space */
  ringGap: number;
  /** 0 = very smooth/stylized, 1 = rough/natural */
  coastDetail: number;
}

/** METADATA ONLY — the generator's output is stored geometry, never re-run at load. */
export interface GeneratorMeta {
  seed: number;
  landAmount: number;
  roughness: number;
  worldType: WorldType;
}

export interface Scene {
  schemaVersion: number;
  meta: SceneMeta;
  settings: SceneSettings;
  generator: GeneratorMeta;
  /** fixed semantic set, fixed render order — no freeform user layers (ADR-15) */
  layers: Layer[];
}

export const CANVAS_PRESETS: Record<CanvasPreset, { w: number; h: number }> = {
  landscape: { w: 4000, h: 3000 },
  square: { w: 3000, h: 3000 },
  portrait: { w: 3000, h: 4000 },
};

/** Render order, bottom → top. Rings are derived and sit between sea fill and terrain. */
export const LAYER_ORDER: ReadonlyArray<{ id: LayerId; kind: LayerKind }> = [
  { id: "terrain", kind: "terrain" },
  { id: "forests", kind: "forest" },
  { id: "mountains", kind: "mountain" },
  { id: "rivers", kind: "river" },
  { id: "icons", kind: "icon" },
  { id: "labels", kind: "label" },
];
