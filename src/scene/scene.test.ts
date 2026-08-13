import { describe, expect, it } from "vitest";
import { createEmptyScene, deserialize, migrate, serialize } from "./scene";
import { CURRENT_SCHEMA_VERSION, type Scene } from "./types";

/** A hand-written scene with one object per type — the shape from 02-scene-data-model.md. */
const handWritten: Scene = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  meta: {
    id: "client-uuid",
    title: "The Sundered Coast",
    style: "fantasy",
    canvas: { preset: "landscape", w: 4000, h: 3000 },
    createdAt: "2026-07-21T00:00:00Z",
    updatedAt: "2026-07-21T00:00:00Z",
  },
  settings: { parchment: true, coastalRings: true, ringCount: 4, ringGap: 14, coastDetail: 0.5 },
  generator: { seed: 123456, landAmount: 0.45, roughness: 0.6, worldType: "single" },
  layers: [
    {
      id: "terrain",
      kind: "terrain",
      visible: true,
      locked: false,
      objects: [
        {
          id: "lm1",
          type: "landmass",
          path: [
            [0, 0],
            [100, 0],
            [100, 100],
            [0, 100],
          ],
          holes: [
            [
              [40, 40],
              [40, 60],
              [60, 60],
              [60, 40],
            ],
          ],
          biome: "grassland",
        },
      ],
    },
    {
      id: "forests",
      kind: "forest",
      visible: true,
      locked: false,
      objects: [
        { id: "t1", type: "tree", x: 900, y: 1200, rotation: 0, scale: 1, z: 0, variant: 2 },
      ],
    },
    {
      id: "mountains",
      kind: "mountain",
      visible: true,
      locked: false,
      objects: [
        { id: "m1", type: "mountain", x: 1200, y: 800, rotation: 0, scale: 1, z: 5, variant: 3 },
      ],
    },
    {
      id: "water",
      kind: "water",
      visible: true,
      locked: false,
      objects: [
        {
          id: "w1",
          type: "water",
          path: [
            [10, 10],
            [50, 10],
            [50, 90],
            [10, 90],
          ],
          holes: [],
        },
      ],
    },
    {
      id: "icons",
      kind: "icon",
      visible: true,
      locked: false,
      objects: [
        {
          id: "i1",
          type: "landmark",
          x: 900,
          y: 1100,
          rotation: 0,
          scale: 1,
          z: 0,
          kind: "castle",
        },
      ],
    },
    {
      id: "labels",
      kind: "label",
      visible: true,
      locked: false,
      objects: [
        {
          id: "L1",
          type: "label",
          x: 800,
          y: 950,
          rotation: 0,
          scale: 1,
          z: 0,
          text: "Mirkwood",
          font: "fantasy-serif",
          size: 42,
          pathId: null,
        },
      ],
    },
  ],
};

describe("scene round-trip", () => {
  it("serialize → deserialize → migrate is loss-free", () => {
    expect(deserialize(serialize(handWritten))).toEqual(handWritten);
  });

  it("round-trips a freshly created scene of every preset", () => {
    for (const preset of ["landscape", "square", "portrait"] as const) {
      const scene = createEmptyScene(preset);
      expect(deserialize(serialize(scene))).toEqual(scene);
      expect(scene.layers).toHaveLength(6);
    }
  });

  it("preserves unknown future fields", () => {
    const withExtra = { ...handWritten, meta: { ...handWritten.meta, futureField: 42 } };
    expect(deserialize(JSON.stringify(withExtra))).toEqual(withExtra);
  });
});

/**
 * The same map as it was written at schemaVersion 1: a `rivers` layer holding three rivers,
 * each a centreline plus a width. **v2 has no type for this shape** (ADR-48), which is why it
 * is spelled out rather than derived from `handWritten` — a fixture for a migration has to be
 * the old thing, not the new thing wearing an old version number.
 */
const v1WithRivers = {
  ...handWritten,
  schemaVersion: 1,
  layers: handWritten.layers.map((layer) =>
    layer.id === "water"
      ? {
          id: "rivers",
          kind: "river",
          visible: true,
          locked: false,
          objects: [1, 2, 3].map((n) => ({
            id: `r${n}`,
            type: "river",
            points: [
              [10 * n, 10],
              [50 * n, 90],
            ],
            width: 12,
            taper: true,
            z: 0,
          })),
        }
      : layer,
  ),
} as unknown as Scene;

describe("migrate", () => {
  it("is a no-op at the current version", () => {
    expect(migrate(handWritten)).toEqual(handWritten);
  });

  /**
   * WP-40 (`16` D14) — **deletion, not conversion.** A river was a centreline and a width; a
   * water object is an outline, and inventing the ribbon to convert one would mean keeping a
   * legacy render path alive to check the result against. Free only while the owner is the
   * only person holding drafts (`16` §8).
   */
  it("deletes every river and renames the layer", () => {
    const migrated = migrate(v1WithRivers);
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

    const water = migrated.layers.find((layer) => layer.id === "water");
    expect(water).toBeDefined();
    expect(water!.kind).toBe("water");
    expect(water!.objects).toEqual([]);
    expect(migrated.layers.find((layer) => (layer.id as string) === "rivers")).toBeUndefined();
    expect(
      migrated.layers.flatMap((l) => l.objects).some((o) => (o.type as string) === "river"),
    ).toBe(false);
  });

  it("leaves every other object intact, and the layer order with it", () => {
    const migrated = migrate(v1WithRivers);
    expect(migrated.layers.map((layer) => layer.id)).toEqual([
      "terrain",
      "forests",
      "mountains",
      "water",
      "icons",
      "labels",
    ]);
    for (const layer of migrated.layers) {
      if (layer.id === "water") continue;
      const before = v1WithRivers.layers.find((l) => l.id === layer.id);
      expect(layer.objects).toEqual(before!.objects);
    }
    expect(migrated.meta).toEqual(v1WithRivers.meta);
    expect(migrated.settings).toEqual(v1WithRivers.settings);
    expect(migrated.generator).toEqual(v1WithRivers.generator);
  });

  it("loads a v1 draft through deserialize with no river left in it", () => {
    const loaded = deserialize(JSON.stringify(v1WithRivers));
    expect(loaded.layers.find((layer) => layer.id === "water")!.objects).toEqual([]);
  });

  it("rejects a scene newer than we support", () => {
    const future = { ...handWritten, schemaVersion: CURRENT_SCHEMA_VERSION + 1 };
    expect(() => migrate(future)).toThrow(/newer than supported/);
  });

  it("rejects non-scenes instead of silently loading them", () => {
    expect(() => migrate(null)).toThrow(/expected an object/);
    expect(() => migrate({ layers: [] })).toThrow(/missing schemaVersion/);
  });
});
