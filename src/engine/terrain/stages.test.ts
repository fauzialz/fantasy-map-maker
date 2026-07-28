import { describe, expect, it } from "vitest";
import { fromIntRing, maskToMapRing, SCALE, toIntRing, TOL } from "../geometry/coords";
import { polygonArea, ringArea, signedArea, type Ring } from "../geometry/types";
import { assembleLandmass, cleanRing } from "./assemble";
import { differenceLand, splitByComponents, unionLand } from "./boolean";
import { maskToContours } from "./contours";
import { createMask, maskArea, stampMask } from "./mask";
import { chaikin, epsilonFor, simplify } from "./smooth";
import {
  evaluate,
  materializeLandmass,
  materializeMask,
  materializeShape,
  type Assertion,
  type LandmassInput,
  type MaskInput,
  type PolygonInput,
} from "./__fixtures__/harness";
import s2Fixture from "./__fixtures__/s2-contours.fixture.json";
import s7Fixture from "./__fixtures__/s7-union.fixture.json";
import s9Fixture from "./__fixtures__/s9-split.fixture.json";

const disc = (cx: number, cy: number, r: number, segments = 64): Ring =>
  Array.from({ length: segments }, (_, i) => {
    const angle = (i / segments) * Math.PI * 2;
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });

// ------------------------------------------------------------------ S1 stampMask

describe("S1 stampMask", () => {
  it("leaves no gaps along a fast diagonal drag", () => {
    const mask = createMask(256, 256);
    stampMask(mask, [20, 20], [230, 230], 20);

    for (let t = 0; t <= 1; t += 0.01) {
      const x = Math.round(20 + 210 * t);
      const y = Math.round(20 + 210 * t);
      expect(mask.data[y * mask.w + x], `gap at ${x},${y}`).toBe(1);
    }
  });

  it("scales painted area with the square of brush size", () => {
    const small = stampMask(createMask(256, 256), [128, 128], [128, 128], 20);
    const large = stampMask(createMask(256, 256), [128, 128], [128, 128], 40);
    expect(maskArea(large) / maskArea(small)).toBeCloseTo(4, 1);
  });

  it("erases with value 0", () => {
    const mask = stampMask(createMask(64, 64), [32, 32], [32, 32], 40);
    const painted = maskArea(mask);
    stampMask(mask, [32, 32], [32, 32], 20, 0);
    expect(maskArea(mask)).toBeLessThan(painted);
  });
});

// --------------------------------------------------------------- S2 maskToContours

describe("S2 maskToContours (fixture)", () => {
  for (const testCase of s2Fixture.cases) {
    it(testCase.case, () => {
      const result = maskToContours(materializeMask(testCase.input as MaskInput));
      for (const assertion of testCase.assertions as Assertion[]) {
        expect(evaluate(assertion, { multi: result })).toBeNull();
      }
    });
  }

  it("returns nothing for an empty mask", () => {
    expect(maskToContours(createMask(64, 64))).toEqual([]);
  });

  // Guard against a harness that passes everything: a wrong assertion must report.
  it("reports failures instead of passing vacuously", () => {
    const circle = maskToContours(materializeMask(s2Fixture.cases[0].input as MaskInput));
    expect(
      evaluate({ type: "componentCount", target: "result", n: 99 }, { multi: circle }),
    ).toMatch(/expected 99, got 1/);
    expect(evaluate({ type: "holeCount", target: "result", n: 7 }, { multi: circle })).toMatch(
      /expected 7, got 0/,
    );
  });
});

// ------------------------------------------------------------------- S3 chaikin

describe("S3 chaikin", () => {
  const square: Ring = [
    [0, 0],
    [100, 0],
    [100, 100],
    [0, 100],
  ];

  it("doubles the point count per iteration", () => {
    expect(chaikin(square, 1)).toHaveLength(8);
    expect(chaikin(square, 2)).toHaveLength(16);
    expect(chaikin(square, 3)).toHaveLength(32);
  });

  it("reduces the sharpest turn", () => {
    const turnAngle = (ring: Ring) => {
      let max = 0;
      for (let i = 0, n = ring.length; i < n; i++) {
        const [ax, ay] = ring[(i - 1 + n) % n];
        const [bx, by] = ring[i];
        const [cx, cy] = ring[(i + 1) % n];
        const angle = Math.abs(Math.atan2(cy - by, cx - bx) - Math.atan2(by - ay, bx - ax));
        max = Math.max(max, Math.min(angle, Math.PI * 2 - angle));
      }
      return max;
    };
    expect(turnAngle(chaikin(square, 2))).toBeLessThan(turnAngle(square));
  });

  it("keeps the ring closed and inside its own hull", () => {
    const smoothed = chaikin(square, 2);
    expect(smoothed.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 100)).toBe(true);
    expect(signedArea(smoothed)).not.toBe(0);
  });
});

// ------------------------------------------------------------------ S4 simplify

describe("S4 simplify", () => {
  const coastline = disc(500, 500, 300, 400).map(([x, y], i): [number, number] => [
    x + Math.sin(i) * 6,
    y + Math.cos(i * 1.7) * 6,
  ]);

  it("keeps point count monotonic in coastDetail", () => {
    const counts = [0, 0.25, 0.5, 0.75, 1].map((detail) => simplify(coastline, detail).length);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
  });

  it("reads coastDetail as the data model defines it (0 = smooth, 1 = detailed)", () => {
    expect(epsilonFor(0)).toBeGreaterThan(epsilonFor(1));
    expect(simplify(coastline, 1).length).toBeGreaterThan(simplify(coastline, 0).length);
  });

  it("stays recognisable at both extremes", () => {
    for (const detail of [0, 1]) {
      const simplified = simplify(coastline, detail);
      expect(simplified.length).toBeGreaterThanOrEqual(3);
      expect(ringArea(simplified) / ringArea(coastline)).toBeCloseTo(1, 1);
    }
  });
});

// ---------------------------------------------------------------- S5 coordinates

describe("S5 coordinate conversion", () => {
  const ring: Ring = [
    [0.005, 1200.994],
    [3999.994, 0.001],
    [2000.5, 2999.5],
  ];

  it("round-trips within 1/SCALE", () => {
    fromIntRing(toIntRing(ring)).forEach(([x, y], i) => {
      expect(Math.abs(x - ring[i][0])).toBeLessThanOrEqual(TOL);
      expect(Math.abs(y - ring[i][1])).toBeLessThanOrEqual(TOL);
    });
  });

  it("preserves winding", () => {
    expect(Math.sign(signedArea(fromIntRing(toIntRing(ring))))).toBe(Math.sign(signedArea(ring)));
  });

  it("maps mask pixels to map units by the fixed resolution", () => {
    expect(maskToMapRing([[10, 20]], 0.5)).toEqual([[20, 40]]);
    expect(SCALE).toBe(100);
  });
});

// ------------------------------------------------------------- S6 assembleLandmass

describe("S6 assembleLandmass", () => {
  const outer = disc(200, 200, 100);
  const hole = disc(200, 200, 40);

  it("normalises winding: outer positive, holes negative", () => {
    const landmass = assembleLandmass([[...outer].reverse(), hole])!;
    expect(signedArea(landmass.path)).toBeGreaterThan(0);
    expect(signedArea(landmass.holes[0])).toBeLessThan(0);
  });

  it("produces a valid landmass object", () => {
    const landmass = assembleLandmass([outer, hole], "swamp")!;
    expect(landmass.type).toBe("landmass");
    expect(landmass.biome).toBe("swamp");
    expect(landmass.id).toMatch(/[0-9a-f-]{36}/);
    expect(polygonArea([landmass.path, ...landmass.holes])).toBeCloseTo(
      Math.PI * (100 * 100 - 40 * 40),
      -2,
    );
  });

  it("rejects degenerate geometry instead of emitting it", () => {
    expect(
      assembleLandmass([
        [
          [0, 0],
          [1, 1],
        ],
      ]),
    ).toBeNull();
    expect(
      cleanRing([
        [0, 0],
        [0, 0],
        [10, 0],
        [10, 0],
        [10, 10],
      ]),
    ).toHaveLength(3);
  });
});

// ------------------------------------------------------------------ S7 unionLand

describe("S7 unionLand (fixture)", () => {
  for (const testCase of s7Fixture.cases) {
    it(testCase.case, () => {
      const existing = testCase.input.existing.map((s) => materializeShape(s as PolygonInput));
      const incoming = testCase.input.new.map((s) => materializeShape(s as PolygonInput));
      const result = unionLand(incoming, existing);
      for (const assertion of testCase.assertions as Assertion[]) {
        expect(evaluate(assertion, { multi: result })).toBeNull();
      }
    });
  }

  it("no-ops on empty input", () => {
    expect(unionLand([], [])).toEqual([]);
    const square = materializeShape({
      type: "polygon",
      path: [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
    });
    expect(unionLand([square], [])).toHaveLength(1);
  });
});

// ------------------------------------------------------------ S9 splitByComponents

describe("S9 splitByComponents (fixture)", () => {
  it(s9Fixture.case, () => {
    const sources = s9Fixture.input.existing.map((l) => materializeLandmass(l as LandmassInput));
    const erase = [materializeShape(s9Fixture.input.eraseRegion as PolygonInput)];
    const cut = differenceLand(
      sources.map((source) => [source.path, ...source.holes]),
      erase,
    );
    const result = splitByComponents(cut, sources);

    for (const assertion of s9Fixture.assertions as Assertion[]) {
      expect(evaluate(assertion, { objects: result })).toBeNull();
    }
  });

  it("keeps the larger source's identity when two landmasses merge", () => {
    const big = materializeLandmass({
      type: "landmass",
      id: "big",
      name: "Big",
      shape: {
        type: "polygon",
        path: [
          [0, 0],
          [300, 0],
          [300, 200],
          [0, 200],
        ],
      },
    });
    const small = materializeLandmass({
      type: "landmass",
      id: "small",
      name: "Small",
      shape: {
        type: "polygon",
        path: [
          [280, 0],
          [380, 0],
          [380, 100],
          [280, 100],
        ],
      },
    });
    const merged = unionLand([[small.path, ...small.holes]], [[big.path, ...big.holes]]);
    const result = splitByComponents(merged, [big, small]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("big");
    expect(result[0].name).toBe("Big");
  });

  it("gives every piece a fresh id when there are no sources", () => {
    const two = unionLand(
      [
        materializeShape({ type: "disc", cx: 100, cy: 100, r: 40 }),
        materializeShape({ type: "disc", cx: 400, cy: 100, r: 40 }),
      ],
      [],
    );
    const result = splitByComponents(two);
    expect(result).toHaveLength(2);
    expect(new Set(result.map((l) => l.id)).size).toBe(2);
    expect(result.every((l) => !l.name)).toBe(true);
  });
});
