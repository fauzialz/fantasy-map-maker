import { describe, expect, it } from "vitest";
import type { Landmass } from "../../scene/types";
import { multiPolygonArea, type Rect } from "../geometry/types";
import { pointInMultiPolygon } from "../geometry/nesting";
import {
  evaluate,
  materializeLandmass,
  type Assertion,
  type LandmassInput,
} from "../terrain/__fixtures__/harness";
import { landmassToPolygon } from "../terrain/assemble";
import { clipRings, landUnion, offsetGrow, ringBands, waterRegion } from "./rings";
import { deriveTerrain } from "../water/derive";
import s11Fixture from "./__fixtures__/s11-water.fixture.json";
import straitFixture from "./__fixtures__/strait.fixture.json";

const canvasRect = (canvas: { w: number; h: number }): Rect => ({
  x: 0,
  y: 0,
  w: canvas.w,
  h: canvas.h,
});

// ------------------------------------------------------------------ S10 landUnion

describe("S10 landUnion", () => {
  const island = (id: string, cx: number): Landmass =>
    materializeLandmass({ type: "landmass", id, shape: { type: "disc", cx, cy: 300, r: 80 } });

  it("merges overlapping land into one polygon", () => {
    expect(landUnion([island("a", 370), island("b", 430)])).toHaveLength(1);
  });

  it("keeps detached land separate", () => {
    expect(landUnion([island("a", 200), island("b", 700)])).toHaveLength(2);
  });

  it("preserves lakes", () => {
    const withLake = materializeLandmass(s11Fixture.input.land[0] as LandmassInput);
    const union = landUnion([withLake]);
    expect(union).toHaveLength(1);
    expect(union[0].length).toBe(2); // outer + hole
  });

  it("returns nothing for no land", () => {
    expect(landUnion([])).toEqual([]);
  });
});

// ---------------------------------------------------------------- S11 waterRegion

describe("S11 waterRegion (fixture)", () => {
  it(s11Fixture.case, () => {
    const land = s11Fixture.input.land.map((l) => materializeLandmass(l as LandmassInput));
    const result = waterRegion(canvasRect(s11Fixture.input.canvas), landUnion(land));

    for (const assertion of s11Fixture.assertions as unknown as Assertion[]) {
      expect(evaluate(assertion, { multi: result })).toBeNull();
    }
  });

  it("is the whole canvas when there is no land", () => {
    const water = waterRegion({ x: 0, y: 0, w: 100, h: 100 }, []);
    expect(multiPolygonArea(water)).toBeCloseTo(10000);
  });
});

// ----------------------------------------------------------------- S12 offsetGrow

describe("S12 offsetGrow", () => {
  const disc = landUnion([
    materializeLandmass({
      type: "landmass",
      id: "a",
      shape: { type: "disc", cx: 400, cy: 400, r: 100 },
    }),
  ]);

  it("grows area monotonically with distance", () => {
    const areas = [0, 10, 20, 40, 80].map((d) => multiPolygonArea(offsetGrow(disc, d)));
    for (let i = 1; i < areas.length; i++) expect(areas[i]).toBeGreaterThan(areas[i - 1]);
    // π(100+40)² ≈ 61575, within round-join tessellation slack
    expect(multiPolygonArea(offsetGrow(disc, 40))).toBeCloseTo(Math.PI * 140 * 140, -3);
  });

  it("shrinks a lake as the land grows into it, and eventually closes it", () => {
    const withLake = landUnion([materializeLandmass(s11Fixture.input.land[0] as LandmassInput)]);
    const holeArea = (distance: number) => {
      const grown = offsetGrow(withLake, distance);
      return grown[0]?.slice(1).length ?? 0;
    };
    expect(withLake[0].length).toBe(2);
    expect(holeArea(10)).toBe(1); // lake still there, smaller
    expect(holeArea(60)).toBe(0); // 100x100 lake closed by a 60 offset
  });

  it("no-ops on empty land or a non-positive distance", () => {
    expect(offsetGrow([], 10)).toEqual([]);
    expect(offsetGrow(disc, 0)).toBe(disc);
  });
});

// ------------------------------------------------------------------ S13 ringBands

describe("S13 ringBands", () => {
  const disc = landUnion([
    materializeLandmass({
      type: "landmass",
      id: "a",
      shape: { type: "disc", cx: 400, cy: 400, r: 100 },
    }),
  ]);

  it("produces ringCount bands", () => {
    expect(ringBands(disc, 4, 14)).toHaveLength(4);
    expect(ringBands(disc, 1, 14)).toHaveLength(1);
  });

  it("makes bands that are disjoint and never cover the land they came from", () => {
    const bands = ringBands(disc, 4, 14);
    const summed = bands.reduce((total, band) => total + multiPolygonArea(band), 0);
    const totalGrowth = multiPolygonArea(offsetGrow(disc, 4 * 14)) - multiPolygonArea(disc);
    // Relative, because both areas crossed the scaled-int boundary (see areaTolerance).
    expect(summed / totalGrowth).toBeCloseTo(1, 4);
    expect(pointInMultiPolygon(bands[0], [400, 400])).toBe(false);
  });

  it("orders bands outward from the coast", () => {
    const bands = ringBands(disc, 3, 20);
    expect(pointInMultiPolygon(bands[0], [400, 510])).toBe(true); // 10 out
    expect(pointInMultiPolygon(bands[1], [400, 530])).toBe(true); // 30 out
    expect(pointInMultiPolygon(bands[2], [400, 550])).toBe(true); // 50 out
  });

  it("returns nothing when rings are impossible", () => {
    expect(ringBands([], 4, 14)).toEqual([]);
    expect(ringBands(disc, 0, 14)).toEqual([]);
    expect(ringBands(disc, 4, 0)).toEqual([]);
  });
});

// ------------------------------------------------------- S14 clipRings ⭐ THE STRAIT

describe("S14 clipRings — the strait fixture", () => {
  it(straitFixture.description.slice(0, 60) + "…", () => {
    const land = straitFixture.input.land.map((l) => materializeLandmass(l as LandmassInput));
    const { bands } = deriveTerrain({
      landmasses: land,
      waters: [],
      canvas: canvasRect(straitFixture.input.canvas),
      ringCount: straitFixture.params.ringCount,
      ringGap: straitFixture.params.ringGap,
      rings: true,
    });

    expect(bands).toHaveLength(straitFixture.params.ringCount);
    for (const assertion of straitFixture.assertions as unknown as Assertion[]) {
      expect(
        evaluate(assertion, { bands, land: land.map(landmassToPolygon) }),
        JSON.stringify(assertion),
      ).toBeNull();
    }
  });

  it("puts rings in both the ocean and a lake, from one pass", () => {
    const land = [materializeLandmass(s11Fixture.input.land[0] as LandmassInput)];
    const { bands } = deriveTerrain({
      landmasses: land,
      waters: [],
      canvas: canvasRect(s11Fixture.input.canvas),
      ringCount: 3,
      ringGap: 10,
      rings: true,
    });

    // The lake is 100x100 at (350,250)-(450,350); its inner ring hugs the shore.
    expect(pointInMultiPolygon(bands[0], [400, 255])).toBe(true);
    // Open sea just off the west coast (land starts at x=200).
    expect(pointInMultiPolygon(bands[0], [195, 300])).toBe(true);
    // Land is never covered.
    expect(
      evaluate(
        { type: "landNeverCovered", bands: "result", land: "input.land" },
        {
          bands,
          land: land.map(landmassToPolygon),
        },
      ),
    ).toBeNull();
  });

  it("clips bands to the canvas so land at the edge does not bleed rings outside", () => {
    const edge = materializeLandmass({
      type: "landmass",
      id: "edge",
      shape: {
        type: "polygon",
        path: [
          [0, 0],
          [200, 0],
          [200, 200],
          [0, 200],
        ],
      },
    });
    const canvas = { x: 0, y: 0, w: 800, h: 600 };
    const { bands } = deriveTerrain({
      landmasses: [edge],
      waters: [],
      canvas,
      ringCount: 3,
      ringGap: 15,
      rings: true,
    });

    for (const band of bands) {
      for (const polygon of band) {
        for (const [x, y] of polygon[0]) {
          expect(x).toBeGreaterThanOrEqual(-0.02);
          expect(y).toBeGreaterThanOrEqual(-0.02);
          expect(x).toBeLessThanOrEqual(canvas.w + 0.02);
          expect(y).toBeLessThanOrEqual(canvas.h + 0.02);
        }
      }
    }
  });

  it("derives nothing when there is no land", () => {
    expect(
      deriveTerrain({
        landmasses: [],
        waters: [],
        canvas: { x: 0, y: 0, w: 800, h: 600 },
        ringCount: 4,
        ringGap: 14,
        rings: true,
      }),
    ).toEqual({ land: null, bands: [] });
    expect(clipRings([], [])).toEqual([]);
  });
});
