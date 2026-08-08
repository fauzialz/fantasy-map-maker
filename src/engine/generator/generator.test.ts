import { describe, expect, it } from "vitest";
import type { Landmass } from "../../scene/types";
import { pointInRing } from "../geometry/nesting";
import { polygonArea } from "../geometry/types";
import { landmassToPolygon } from "../terrain/assemble";
import { assignBiomes, biomeFor, centroid } from "./biome";
import { generateFields, quantile, sampleField, type Fields } from "./fields";
import {
  dropSpecks,
  generateWorld,
  landMask,
  OBJECT_BUDGET,
  peakFor,
  seaLevelFor,
  type GenerateRequest,
} from "./generate";
import { landmassAt } from "../../scene/bounds";
import { capToBudget, ridgeLevel, scatterPoints, thin } from "./scatter";

/** A small canvas, so a fixture traces a real world in milliseconds rather than seconds. */
const CANVAS = { w: 800, h: 600 };

const request = (overrides: Partial<GenerateRequest> = {}): GenerateRequest => ({
  canvas: CANVAS,
  seed: 1234,
  landAmount: 0.45,
  roughness: 0.6,
  worldType: "single",
  seaLevel: null,
  mountainDensity: 0.5,
  rotation: 5,
  forestDensity: 0.5,
  coastDetail: 0.5,
  ...overrides,
});

const fieldsFor = (seed: number, overrides: Partial<Parameters<typeof generateFields>[0]> = {}) =>
  generateFields({ seed, roughness: 0.6, worldType: "single", canvas: CANVAS, ...overrides });

const landArea = (landmasses: Landmass[]): number =>
  landmasses.reduce((total, l) => total + polygonArea(landmassToPolygon(l)), 0);

/**
 * Fields at one cell per 10 map units: hot and dry where `hot` says so, cold and wet
 * everywhere else. The resolution is fine enough that bilinear bleed across the boundary
 * dies out well inside one sample spacing.
 */
function fieldsWhere(hot: (x: number, y: number) => boolean): Fields {
  const w = CANVAS.w / 10;
  const h = CANVAS.h / 10;
  const flat = new Float32Array(w * h).fill(0.6);
  const moisture = new Float32Array(w * h);
  const temperature = new Float32Array(w * h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const inside = hot((col / (w - 1)) * CANVAS.w, (row / (h - 1)) * CANVAS.h);
      moisture[row * w + col] = inside ? 0.05 : 0.8;
      temperature[row * w + col] = inside ? 0.9 : 0.05;
    }
  }
  return {
    elevation: { w, h, data: flat },
    moisture: { w, h, data: moisture },
    temperature: { w, h, data: temperature },
  };
}

const square = (x: number, y: number, size: number): Landmass => ({
  id: `sq-${x}-${y}-${size}`,
  type: "landmass",
  path: [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ],
  holes: [],
  biome: "grassland",
});

// ------------------------------------------------------------------ 10a noise fields

describe("10a noise fields", () => {
  it("gives the same world for the same seed, and a different one otherwise", () => {
    expect(Array.from(fieldsFor(99).elevation.data)).toEqual(
      Array.from(fieldsFor(99).elevation.data),
    );
    expect(Array.from(fieldsFor(99).moisture.data)).toEqual(
      Array.from(fieldsFor(99).moisture.data),
    );

    const other = fieldsFor(100).elevation.data;
    expect(Array.from(fieldsFor(99).elevation.data)).not.toEqual(Array.from(other));
  });

  it("keeps every field inside 0..1", () => {
    const { elevation, moisture, temperature } = fieldsFor(7);
    for (const field of [elevation, moisture, temperature]) {
      for (const value of field.data) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("runs colder toward the poles than at the equator", () => {
    const { temperature } = fieldsFor(3);
    const middle = sampleField(temperature, 0.5, 0.5);
    expect(middle).toBeGreaterThan(sampleField(temperature, 0.5, 0.02));
    expect(middle).toBeGreaterThan(sampleField(temperature, 0.5, 0.98));
  });

  it("answers quantile with the value that fraction of cells fall below", () => {
    const field = { w: 10, h: 10, data: Float32Array.from({ length: 100 }, (_, i) => i / 100) };
    expect(quantile(field, 0.5)).toBeCloseTo(0.5, 1);
    expect(quantile(field, 0.9)).toBeCloseTo(0.9, 1);
  });

  it("makes roughness add detail — more octaves, more local variation", () => {
    const variation = (roughness: number) => {
      const { elevation } = fieldsFor(11, { roughness });
      let sum = 0;
      for (let i = 1; i < elevation.data.length; i++) {
        sum += Math.abs(elevation.data[i] - elevation.data[i - 1]);
      }
      return sum;
    };
    expect(variation(1)).toBeGreaterThan(variation(0));
  });
});

// ------------------------------------------------------------------ 10b land mask

describe("10b land mask and terrain", () => {
  it("puts more land on the canvas as landAmount rises", () => {
    const areaFor = (landAmount: number) => {
      const fields = fieldsFor(21);
      const level = seaLevelFor(fields, request({ landAmount }));
      const mask = landMask(fields.elevation, level, CANVAS);
      return mask.data.reduce((total: number, v) => total + v, 0);
    };

    const low = areaFor(0.2);
    const mid = areaFor(0.45);
    const high = areaFor(0.7);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it("hits the requested land fraction, because sea level is a quantile of the field", () => {
    const fields = fieldsFor(22);
    const mask = landMask(
      fields.elevation,
      seaLevelFor(fields, request({ landAmount: 0.4 })),
      CANVAS,
    );
    const fraction = mask.data.reduce((total: number, v) => total + v, 0) / mask.data.length;
    expect(fraction).toBeGreaterThan(0.3);
    expect(fraction).toBeLessThan(0.5);
  });

  it("produces landmasses through the brush's own commit path", () => {
    const { landmasses } = generateWorld(request());
    expect(landmasses.length).toBeGreaterThan(0);
    for (const landmass of landmasses) {
      expect(landmass.type).toBe("landmass");
      expect(landmass.path.length).toBeGreaterThanOrEqual(3);
      expect(polygonArea(landmassToPolygon(landmass))).toBeGreaterThan(0);
    }
  });

  it("shapes the world differently per worldType", () => {
    const islands = (worldType: GenerateRequest["worldType"]) =>
      generateWorld(request({ worldType, seed: 42 })).landmasses.length;
    // An archipelago is many islands by construction; a single continent is not.
    expect(islands("archipelago")).toBeGreaterThan(islands("single"));
  });
});

// ------------------------------------------------------------------ 10c speck filter

describe("10c speck filter", () => {
  it("removes sub-threshold specks and keeps large islands", () => {
    const kept = dropSpecks([square(0, 0, 100), square(400, 400, 5)], 1000);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe(square(0, 0, 100).id);
  });

  it("leaves nothing tiny in a generated world", () => {
    const { landmasses } = generateWorld(request());
    const minArea = CANVAS.w * CANVAS.h * 0.0006;
    for (const landmass of landmasses) {
      expect(polygonArea(landmassToPolygon(landmass))).toBeGreaterThanOrEqual(minArea);
    }
  });
});

// ------------------------------------------------------------------ 10d biomes

describe("10d biome assignment", () => {
  it("sends a hot dry region to desert and a cold one to snow", () => {
    expect(biomeFor(0.6, 0.1, 0.9)).toBe("desert");
    expect(biomeFor(0.6, 0.8, 0.1)).toBe("snow");
    expect(biomeFor(0.3, 0.9, 0.6)).toBe("swamp");
    expect(biomeFor(0.7, 0.7, 0.5)).toBe("forest");
    expect(biomeFor(0.6, 0.4, 0.5)).toBe("grassland");
  });

  it("labels each landmass from the fields under it", () => {
    const cold: Fields = {
      elevation: { w: 2, h: 2, data: Float32Array.from([0.6, 0.6, 0.6, 0.6]) },
      moisture: { w: 2, h: 2, data: Float32Array.from([0.8, 0.8, 0.8, 0.8]) },
      temperature: { w: 2, h: 2, data: Float32Array.from([0.1, 0.1, 0.1, 0.1]) },
    };
    expect(assignBiomes([square(100, 100, 200)], cold, CANVAS)[0].biome).toBe("snow");
  });

  it("takes the centroid of a ring, not the first corner", () => {
    const [x, y] = centroid(square(0, 0, 100).path);
    expect(x).toBeCloseTo(50, 6);
    expect(y).toBeCloseTo(50, 6);
  });

  /**
   * A crescent's centroid lies out in the water it wraps around. Sampling there reads the
   * biome from somewhere the landmass isn't — measured across nine generated worlds, it
   * landed outside in five, every time on the largest continent.
   */
  it("labels a crescent from land it actually covers, not from its hollow", () => {
    // A C opening to the right: a spine down the left, arms reaching right top and bottom.
    const crescent: Landmass = {
      id: "crescent",
      type: "landmass",
      path: [
        [100, 100],
        [600, 100],
        [600, 200],
        [250, 200],
        [250, 400],
        [600, 400],
        [600, 500],
        [100, 500],
      ],
      holes: [],
      biome: "grassland",
    };

    // Hot and dry inside the hollow only; cold and wet over every part of the land.
    const hollow = (x: number, y: number) => x > 250 && x < 600 && y > 200 && y < 400;
    const fields = fieldsWhere(hollow);

    const middle = centroid(crescent.path);
    expect(pointInRing(crescent.path, middle), "centroid should fall in the hollow").toBe(false);
    // What the old single-sample implementation would have answered, from open water:
    expect(biomeFor(0.6, 0.05, 0.9)).toBe("desert");

    expect(assignBiomes([crescent], fields, CANVAS)[0].biome).toBe("snow");
  });

  it("still labels a sliver too thin to catch a sample point", () => {
    const sliver: Landmass = {
      id: "sliver",
      type: "landmass",
      path: [
        [100, 100],
        [700, 101],
        [100, 101],
      ],
      holes: [],
      biome: "grassland",
    };
    expect(
      assignBiomes(
        [sliver],
        fieldsWhere(() => false),
        CANVAS,
      )[0].biome,
    ).toBe("snow");
  });
});

// ------------------------------------------------------------------ 10e/10f scatter

describe("10e/10f scatter", () => {
  it("never places two points closer than the Poisson radius", () => {
    const points = scatterPoints({
      rng: Math.random,
      canvas: CANVAS,
      radius: 40,
      candidates: 3000,
      accept: () => true,
    });

    expect(points.length).toBeGreaterThan(20);
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        expect(
          Math.hypot(points[i][0] - points[j][0], points[i][1] - points[j][1]),
        ).toBeGreaterThanOrEqual(40);
      }
    }
  });

  it("respects the accept predicate", () => {
    const points = scatterPoints({
      rng: Math.random,
      canvas: CANVAS,
      radius: 20,
      candidates: 2000,
      accept: (x) => x < 200,
    });
    expect(points.length).toBeGreaterThan(0);
    for (const [x] of points) expect(x).toBeLessThan(200);
  });

  it("finds which landmass covers a point, and sees through lakes", () => {
    const withLake: Landmass = {
      ...square(0, 0, 400),
      holes: [
        [
          [100, 100],
          [300, 100],
          [300, 300],
          [100, 300],
        ],
      ],
    };
    expect(landmassAt([withLake], 50, 50)?.id).toBe(withLake.id);
    expect(landmassAt([withLake], 200, 200)).toBeUndefined();
    expect(landmassAt([withLake], 600, 600)).toBeUndefined();
  });

  it("puts mountains on high ground and trees on land, never in the sea", () => {
    const generated = generateWorld(request());
    const fields = fieldsFor(1234);
    const seaLevel = seaLevelFor(fields, request());
    // Asked of the same helper the scatter uses, so the fixture can't drift from the rule.
    const ridge = ridgeLevel(seaLevel, peakFor(fields));

    expect(generated.mountains.length).toBeGreaterThan(0);
    for (const mountain of generated.mountains) {
      expect(
        sampleField(fields.elevation, mountain.x / CANVAS.w, mountain.y / CANVAS.h),
      ).toBeGreaterThanOrEqual(ridge);
      expect(landmassAt(generated.landmasses, mountain.x, mountain.y)).toBeDefined();
    }

    expect(generated.trees.length).toBeGreaterThan(0);
    for (const tree of generated.trees) {
      const home = landmassAt(generated.landmasses, tree.x, tree.y);
      expect(home).toBeDefined();
      expect(home?.biome).not.toBe("desert");
      expect(sampleField(fields.elevation, tree.x / CANVAS.w, tree.y / CANVAS.h)).toBeGreaterThan(
        seaLevel,
      );
    }
  });

  it("scatters more with a higher density", () => {
    const sparse = generateWorld(request({ mountainDensity: 0.15 })).mountains.length;
    const dense = generateWorld(request({ mountainDensity: 1 })).mountains.length;
    expect(dense).toBeGreaterThan(sparse);
  });
});

// ------------------------------------------------------------------ 10g budget

describe("10g budget cap", () => {
  it("thins evenly through the list", () => {
    expect(thin([1, 2, 3, 4, 5, 6, 7, 8], 4)).toEqual([1, 3, 5, 7]);
    expect(thin([1, 2, 3], 9)).toEqual([1, 2, 3]);
  });

  it("brings an over-full world back inside the budget, keeping both kinds", () => {
    const mountains = Array.from({ length: 800 }, (_, i) => ({ id: `m${i}` })) as never[];
    const trees = Array.from({ length: 1600 }, (_, i) => ({ id: `t${i}` })) as never[];
    const capped = capToBudget(mountains, trees, 1200);

    expect(capped.mountains.length + capped.trees.length).toBeLessThanOrEqual(1200);
    expect(capped.mountains.length).toBeGreaterThan(0);
    expect(capped.trees.length).toBeGreaterThan(0);
  });

  it("keeps a dense generated world inside the object budget", () => {
    const dense = generateWorld(
      request({ mountainDensity: 1, forestDensity: 1, landAmount: 0.9, seed: 5 }),
    );
    expect(dense.mountains.length + dense.trees.length).toBeLessThanOrEqual(OBJECT_BUDGET);
  });
});

// ------------------------------------------------------------------ 10h assemble

describe("10h assemble", () => {
  it("gives the same world twice for one seed, and a different one for another", () => {
    const a = generateWorld(request({ seed: 77 }));
    const b = generateWorld(request({ seed: 77 }));
    const c = generateWorld(request({ seed: 78 }));

    expect(a.landmasses.map((l) => l.path)).toEqual(b.landmasses.map((l) => l.path));
    expect(a.mountains.map((m) => [m.x, m.y])).toEqual(b.mountains.map((m) => [m.x, m.y]));
    expect(a.landmasses.map((l) => l.path)).not.toEqual(c.landmasses.map((l) => l.path));
  });

  it("hands back ordinary editable objects — fresh ids, jittered, nothing locked", () => {
    const { landmasses, mountains, trees } = generateWorld(request());
    const ids = new Set([...landmasses, ...mountains, ...trees].map((o) => o.id));
    expect(ids.size).toBe(landmasses.length + mountains.length + trees.length);

    for (const object of [...mountains, ...trees]) {
      expect(object.scale).toBeGreaterThan(0);
      expect(Math.abs(object.rotation)).toBeLessThanOrEqual(5);
      expect(object.z).toBe(0);
    }
  });

  it("populates terrain, mountains and forests — and nothing else (ADR-21)", () => {
    const world = generateWorld(request());
    expect(landArea(world.landmasses)).toBeGreaterThan(0);
    expect(world.mountains.every((m) => m.type === "mountain")).toBe(true);
    expect(world.trees.every((t) => t.type === "tree")).toBe(true);
    expect(Object.keys(world).sort()).toEqual(["landmasses", "mountains", "trees"]);
  });
});
