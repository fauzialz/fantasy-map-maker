import { describe, expect, it } from "vitest";
import type { Landmass, Point, Water } from "../../scene/types";
import { multiPolygonArea, ringArea } from "../geometry/types";
import { pointInPolygon } from "../geometry/nesting";
import { layRibbon } from "./commit";
import { touchesLand, waterToPolygon } from "./cut";
import { centreline, commitRibbon, previewRibbon } from "./ribbon";

/**
 * WP-43 — the spline generator.
 *
 * The assertions that matter here are unusual in one way, and `16` §5 says so outright: **the
 * test asserts the difference rather than a value**. Width is an artistic random walk with no
 * stored seed (D7, D8, D17), so "the same path drawn twice gives different banks, and neither is
 * reproducible" is the specification — a fixture pinning an expected outline would be testing
 * that the feature had been removed.
 */

const straight = (from: Point, to: Point, steps = 20): Point[] =>
  Array.from({ length: steps + 1 }, (_, i): Point => [
    from[0] + ((to[0] - from[0]) * i) / steps,
    from[1] + ((to[1] - from[1]) * i) / steps,
  ]);

/** The ribbon's widest and narrowest crossing, measured perpendicular to a horizontal path. */
const widthRange = (ribbon: Point[], xs: number[]) => {
  const at = (x: number) => {
    const near = ribbon.filter((p) => Math.abs(p[0] - x) < 12).map((p) => p[1]);
    return near.length >= 2 ? Math.max(...near) - Math.min(...near) : null;
  };
  const widths = xs.map(at).filter((w): w is number => w !== null);
  return { min: Math.min(...widths), max: Math.max(...widths), widths };
};

const PATH = straight([200, 500], [1800, 500]);
const SAMPLES = [400, 600, 800, 1000, 1200, 1400, 1600];

describe("the preview", () => {
  /**
   * **The ribbon, not a line** (`16` §5). A tool that shows nothing until it commits is the
   * complaint `12-tools-that-say-what-they-do.md` opens with; the pleasant surprise belongs in
   * the detail, never in the object.
   */
  it("is a closed ribbon at the nominal width", () => {
    const preview = previewRibbon(PATH, 60);
    expect(preview.length).toBeGreaterThan(10);

    const { min, max } = widthRange(preview, SAMPLES);
    expect(min).toBeCloseTo(60, 0);
    expect(max).toBeCloseTo(60, 0);
  });

  it("follows the width setting", () => {
    for (const width of [12, 40, 120]) {
      const { min, max } = widthRange(previewRibbon(PATH, width), SAMPLES);
      expect(min).toBeCloseTo(width, 0);
      expect(max).toBeCloseTo(width, 0);
    }
  });

  /** No randomisation in the preview — the shape is settled, only the banks are not. */
  it("is identical every time for the same path and width", () => {
    expect(previewRibbon(PATH, 60)).toEqual(previewRibbon(PATH, 60));
  });
});

describe("the committed river", () => {
  /**
   * **D7 — a random walk, not a taper.** A river may be wide in the middle, and nothing
   * accumulates downstream. This is where `15-river-engine.md`'s H2 is closed permanently:
   * width is an artistic choice here, not a hydrological consequence.
   */
  it("varies its width along its length, without tapering", () => {
    const { widths } = widthRange(commitRibbon(PATH, 60, 0.8), SAMPLES);
    expect(widths.length).toBeGreaterThan(4);

    const spread = Math.max(...widths) - Math.min(...widths);
    expect(spread).toBeGreaterThan(2);

    // Not a taper: the widest crossing is not reliably at either end. Asserted as "the ends
    // are not the extremes every time", over several draws, since one draw could be either.
    const endIsWidest = Array.from({ length: 12 }, () => {
      const w = widthRange(commitRibbon(PATH, 60, 0.8), SAMPLES).widths;
      const widest = w.indexOf(Math.max(...w));
      return widest === 0 || widest === w.length - 1;
    }).filter(Boolean).length;
    expect(endIsWidest).toBeLessThan(12);
  });

  /**
   * **D15 — variation is proportional to the base width, and there is no floor.** The design
   * states it as a 40-unit river wandering 28–52 and a 6-unit river wandering 4–8, which is
   * ±30%. Proportional variation is what makes a floor unnecessary: a river cannot wander to
   * nothing when every step is a fraction of where it already is.
   */
  it.each([6, 40, 120])("keeps width within ±30%% of the nominal %i", (width) => {
    for (let draw = 0; draw < 8; draw++) {
      const { min, max } = widthRange(commitRibbon(PATH, width, 1), SAMPLES);
      expect(min).toBeGreaterThan(width * 0.7 - 1);
      expect(max).toBeLessThan(width * 1.3 + 1);
      // No floor, and none needed — it never approaches nothing.
      expect(min).toBeGreaterThan(0);
    }
  });

  /**
   * **The assertion `16` §5 asks for by name.** The same path drawn twice gives different banks
   * and neither is reproducible — *that is the design*, so the test asserts the difference
   * rather than a value. Nothing is stored that could reproduce a river, which is why there is
   * no Reroll (D17) and why a spline-made river is indistinguishable from a brushed one (C9).
   */
  it("gives different banks each time the same path is drawn", () => {
    const first = commitRibbon(PATH, 60, 0.8);
    const second = commitRibbon(PATH, 60, 0.8);

    expect(first).not.toEqual(second);
    // Different in the banks, not in the route: both still span the same path.
    expect(Math.abs(ringArea(first) - ringArea(second))).toBeLessThan(ringArea(first) * 0.25);
  });

  it("is smooth — the drawn centreline is the corner-cut path, not the raw points", () => {
    const raw: Point[] = [
      [0, 0],
      [100, 0],
      [100, 100],
    ];
    const line = centreline(raw);
    expect(line.length).toBeGreaterThan(raw.length);
    // The corner is cut: nothing sits at the sharp vertex any more.
    expect(line.some(([x, y]) => x === 100 && y === 0)).toBe(false);
  });

  it("makes nothing from a path with fewer than two points", () => {
    expect(commitRibbon([[10, 10]], 40, 0.5)).toEqual([]);
    expect(previewRibbon([], 40)).toEqual([]);
  });
});

describe("what the object carries", () => {
  const continent: Landmass = {
    id: "c",
    type: "landmass",
    path: [
      [100, 100],
      [1900, 100],
      [1900, 900],
      [100, 900],
    ],
    holes: [],
    biome: "grassland",
  };

  /**
   * **The acceptance criterion that reads the scene rather than the render.** A committed river
   * carries no `width`, `seed` or `points`: those are tool settings that shaped the geometry and
   * are then gone, the way brush size is gone (D8). It is the field list that makes a
   * spline-made river indistinguishable from a brushed one afterwards (C9).
   */
  it("has no width, seed or points — only an outline and holes", () => {
    const [river] = layRibbon([], commitRibbon(PATH, 60, 0.5));

    expect(Object.keys(river).sort()).toEqual(["holes", "id", "path", "type"]);
    expect(river.type).toBe("water");
    expect(river).not.toHaveProperty("width");
    expect(river).not.toHaveProperty("seed");
    expect(river).not.toHaveProperty("points");
    expect(river).not.toHaveProperty("roughness");
  });

  /** D10 — it merges like any other water the moment it lands. */
  it("merges with a river drawn across it into one object", () => {
    const first = layRibbon([], commitRibbon(PATH, 60, 0.5));
    const crossing = straight([1000, 200], [1000, 800]);
    const both = layRibbon(first, commitRibbon(crossing, 60, 0.5));

    expect(first).toHaveLength(1);
    expect(both).toHaveLength(1);
    expect(pointInPolygon(waterToPolygon(both[0]), [400, 500])).toBe(true);
    expect(pointInPolygon(waterToPolygon(both[0]), [1000, 300])).toBe(true);
  });

  it("keeps two rivers that never meet as two objects", () => {
    const first = layRibbon([], commitRibbon(straight([200, 200], [800, 200]), 40, 0.5));
    const both = layRibbon(first, commitRibbon(straight([200, 800], [800, 800]), 40, 0.5));
    expect(both).toHaveLength(2);
  });

  /**
   * **D16 as a refusal.** A river entirely over open sea would cut land that was never there,
   * so the tool declines rather than leaving an object nobody can see. `touchesLand` is what
   * the tool asks before committing.
   */
  it("knows when a river has no land to cut through", () => {
    const overLand = commitRibbon(straight([300, 400], [1500, 400]), 60, 0.5);
    const overSea = commitRibbon(straight([300, 1500], [1500, 1500]), 60, 0.5);

    expect(touchesLand(overLand, [continent])).toBe(true);
    expect(touchesLand(overSea, [continent])).toBe(false);
    expect(touchesLand(overLand, [])).toBe(false);
  });

  /** And nothing is committed in that case — the collection comes back untouched. */
  it("adds nothing to the collection when the ribbon is degenerate", () => {
    const existing: Water[] = layRibbon([], commitRibbon(PATH, 60, 0.5));
    expect(layRibbon(existing, [])).toBe(existing);
    expect(multiPolygonArea(existing.map(waterToPolygon))).toBeGreaterThan(0);
  });
});
