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
 * the same commit (ADR-23, `02` §6).
 */
type MigrationStep = (scene: Scene) => Scene;
const MIGRATIONS: Partial<Record<number, MigrationStep>> = {
  /**
   * v1 → v2 — water as objects (WP-40, `16` D14).
   *
   * **Every existing river is deleted, not converted.** A river was a centreline plus a
   * width; a water object is an outline, and the two are not the same information — a
   * conversion would have to invent the ribbon, re-derive its outline, and keep a legacy
   * render path alive to check the result against. Deletion is the cheapest correct answer
   * **and it is free only while the owner is the only person holding drafts** (`16` §8).
   * Staging is live, so if that ever stops being true this decision reopens rather than
   * quietly destroying someone's map.
   *
   * The layer is renamed in the same step: `rivers`/`river` becomes `water`/`water`, because
   * carve makes lakes and lay makes rivers and both are one substance (`12`'s thesis applied
   * to a layer name). Renaming here rather than in a later step keeps a v1 draft one hop from
   * loadable.
   */
  1: (scene) => ({
    ...scene,
    schemaVersion: 2,
    layers: scene.layers.map((layer) =>
      layer.id === ("rivers" as string)
        ? { ...layer, id: "water" as const, kind: "water" as const, objects: [] }
        : // Defensive, and cheap: a river could only ever live in the rivers layer, but a
          // stray one anywhere else would type-check as a SceneObject and then draw nothing.
          {
            ...layer,
            objects: layer.objects.filter((object) => (object.type as string) !== "river"),
          },
    ),
  }),
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
