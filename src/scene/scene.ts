import {
  CANVAS_PRESETS,
  CURRENT_SCHEMA_VERSION,
  LAYER_ORDER,
  type CanvasPreset,
  type Scene,
} from "./types";

export function createEmptyScene(
  preset: CanvasPreset = "landscape",
  title = "Untitled Map",
): Scene {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      id: crypto.randomUUID(),
      title,
      style: "fantasy",
      canvas: { preset, ...CANVAS_PRESETS[preset] },
      createdAt: now,
      updatedAt: now,
    },
    settings: {
      parchment: true,
      coastalRings: true,
      ringCount: 4,
      ringGap: 14,
      coastDetail: 0.5,
    },
    generator: {
      seed: Math.floor(Math.random() * 2 ** 31),
      landAmount: 0.45,
      roughness: 0.6,
      worldType: "single",
    },
    layers: LAYER_ORDER.map(({ id, kind }) => ({
      id,
      kind,
      visible: true,
      locked: false,
      objects: [],
    })),
  };
}

/**
 * One step from schemaVersion N to N+1. Every schema change ships its migration step in
 * the same commit (ADR-23). Empty at v1 — the loop below is the contract, not dead code.
 */
type MigrationStep = (scene: Scene) => Scene;
const MIGRATIONS: Partial<Record<number, MigrationStep>> = {
  // 1: (scene) => ({ ...scene, schemaVersion: 2, /* … */ }),
};

/**
 * Pure. Runs on EVERY load path — local draft, cloud fetch, .map.json import, library
 * input. Unknown fields are carried through untouched (forward-compat) because each step
 * spreads the scene it receives.
 */
export function migrate(raw: unknown): Scene {
  if (typeof raw !== "object" || raw === null) throw new Error("Not a scene: expected an object");
  let scene = raw as Scene;
  if (typeof scene.schemaVersion !== "number")
    throw new Error("Not a scene: missing schemaVersion");
  if (scene.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Scene schemaVersion ${scene.schemaVersion} is newer than supported ${CURRENT_SCHEMA_VERSION}`,
    );
  }
  while (scene.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATIONS[scene.schemaVersion];
    if (!step) throw new Error(`No migration from schemaVersion ${scene.schemaVersion}`);
    scene = step(scene);
  }
  return scene;
}

export const serialize = (scene: Scene): string => JSON.stringify(scene);

/** The only way to turn stored JSON back into a Scene — migrate() is not optional. */
export const deserialize = (json: string): Scene => migrate(JSON.parse(json));
