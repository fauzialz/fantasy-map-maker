import { describe, expect, it } from "vitest";
import { createEmptyScene, deserialize, migrate, serialize } from "./scene";
import { CURRENT_SCHEMA_VERSION, type Scene } from "./types";

/** A hand-written scene with one object per type — the shape from 02-scene-data-model.md. */
const handWritten: Scene = {
  schemaVersion: 1,
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
      id: "rivers",
      kind: "river",
      visible: true,
      locked: false,
      objects: [
        {
          id: "r1",
          type: "river",
          points: [
            [10, 10],
            [50, 90],
          ],
          width: 12,
          taper: true,
          z: 0,
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

describe("migrate", () => {
  it("is a no-op at the current version", () => {
    expect(migrate(handWritten)).toEqual(handWritten);
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
