import { describe, expect, it } from "vitest";
import type { Landmass, Water } from "../../scene/types";
import { MASK_RESOLUTION } from "../geometry/coords";
import { pointInPolygon } from "../geometry/nesting";
import { multiPolygonArea, type Point } from "../geometry/types";
import { createMask, stampMask, type Mask } from "../terrain/mask";
import { terrainCommit } from "../terrain/pipeline";
import { waterToPolygon } from "./cut";

/**
 * WP-42 — **land carves water** (D18, ADR-49), and the severing that follows.
 *
 * The asymmetry under test is required rather than convenient (C8): water subtracts from land
 * non-destructively at draw time, so if land also subtracted from water non-destructively the
 * two would define each other in a circle. One direction has to be destructive, and this is it
 * — which is why every assertion below is about geometry that is actually *gone*, not hidden.
 */

const CANVAS = { w: 3000, h: 2000 };

const strokeMask = (a: Point, b: Point, brushSize: number): Mask => {
  const mask = createMask(
    Math.ceil(CANVAS.w * MASK_RESOLUTION),
    Math.ceil(CANVAS.h * MASK_RESOLUTION),
  );
  const scale = ([x, y]: Point): Point => [x * MASK_RESOLUTION, y * MASK_RESOLUTION];
  stampMask(mask, scale(a), scale(b), brushSize * MASK_RESOLUTION);
  return mask;
};

/** A river running west→east across the middle of the map, 80 units wide. */
const river = (id = "r1"): Water => ({
  id,
  type: "water",
  path: [
    [200, 960],
    [2800, 960],
    [2800, 1040],
    [200, 1040],
  ],
  holes: [],
});

const pond = (): Water => ({
  id: "p1",
  type: "water",
  path: [
    [1400, 500],
    [1600, 500],
    [1600, 700],
    [1400, 700],
  ],
  holes: [],
});

const paint = (
  existingWater: Water[],
  a: Point,
  b: Point,
  brushSize: number,
  existingLand: Landmass[] = [],
  mode: "paint" | "erase" = "paint",
) =>
  terrainCommit({
    mask: strokeMask(a, b, brushSize),
    maskResolution: MASK_RESOLUTION,
    coastDetail: 0.5,
    mode,
    existingLand,
    existingWater,
  });

const area = (waters: Water[]) => multiPolygonArea(waters.map(waterToPolygon));
const covers = (waters: Water[], point: Point) =>
  waters.some((water) => pointInPolygon(waterToPolygon(water), point));

describe("painting land across a river", () => {
  /**
   * The headline, and the mirror of the sea brush cutting a landmass in two: a stroke across a
   * river **severs it into two objects**. That is also the only way to remove *part* of a water
   * body, since merging is eager (D10) and the eraser takes objects whole — which is the whole
   * reason D18 gave this job to the terrain brush.
   */
  it("severs it into two water objects", () => {
    const { waters } = paint([river()], [1500, 700], [1500, 1300], 300);

    expect(waters).not.toBeNull();
    expect(waters!).toHaveLength(2);
    // One arm either side of the stroke, and nothing left in the middle.
    expect(covers(waters!, [600, 1000])).toBe(true);
    expect(covers(waters!, [2400, 1000])).toBe(true);
    expect(covers(waters!, [1500, 1000])).toBe(false);
  });

  it("keeps the larger piece's id, as any boolean op here does (ADR-10)", () => {
    // Cut off-centre, so one arm is unambiguously the bigger.
    const { waters } = paint([river("trunk")], [800, 700], [800, 1300], 300);
    expect(waters!).toHaveLength(2);

    const biggest = waters!.reduce((a, b) =>
      multiPolygonArea([waterToPolygon(a)]) > multiPolygonArea([waterToPolygon(b)]) ? a : b,
    );
    expect(biggest.id).toBe("trunk");
  });

  /** A stroke that clips a bank narrows the river without splitting it. */
  it("leaves one object when it merely narrows the river", () => {
    const before = [river()];
    // Centred on the river's north bank, so the disc (radius 60) shaves y 940–1000 off it.
    const { waters } = paint(before, [600, 940], [2400, 940], 120);

    expect(waters).not.toBeNull();
    expect(waters!).toHaveLength(1);
    expect(area(waters!)).toBeLessThan(area(before));
    expect(area(waters!)).toBeGreaterThan(area(before) * 0.4);
  });

  it("deletes a small water body it covers entirely", () => {
    const { waters } = paint([pond()], [1500, 600], [1500, 601], 500);
    expect(waters).not.toBeNull();
    expect(waters!).toHaveLength(0);
  });

  /**
   * Null means "the stroke never touched the water", and it is load-bearing rather than tidy:
   * the reply crosses a `postMessage` and arrives as a copy, so echoing the input back would
   * rewrite the water layer on every land stroke — putting it in the undo diff and invalidating
   * a derivation with no reason to re-run.
   */
  it("reports null when the stroke misses the water entirely", () => {
    expect(paint([river()], [500, 200], [900, 300], 150).waters).toBeNull();
  });

  it("reports null when there is no water at all", () => {
    expect(paint([], [500, 900], [900, 1100], 300).waters).toBeNull();
  });
});

describe("the asymmetry C8 forces", () => {
  /**
   * **The sea brush does not carve water.** It removes *land*, and water is a separate
   * substance sitting in its own collection — a stroke that erases the land under a river
   * leaves the river exactly where it was, which is what "one direction is destructive" means
   * in practice: only painting destroys water, and only water non-destructively hides land.
   */
  it("erasing land leaves the water untouched", () => {
    expect(paint([river()], [1500, 700], [1500, 1300], 300, [], "erase").waters).toBeNull();
  });

  /** And the destruction is real: the carved geometry is gone from the object, not masked. */
  it("carving is destructive — the water object itself is smaller afterwards", () => {
    const before = river();
    const { waters } = paint([before], [1500, 700], [1500, 1300], 300);
    const survivors = waters!;

    expect(area(survivors)).toBeLessThan(area([before]) * 0.95);
    // The input object is untouched — the pipeline is pure; it is the *store* that replaces it.
    expect(before.path).toHaveLength(4);
  });
});

describe("both halves of one stroke", () => {
  /**
   * A stroke across a river grows land **and** shrinks water, and the two arrive together.
   * That is the reason WP-42 is its own package: they must land in one undo step, which they
   * can only do if one round-trip produces both.
   */
  it("returns the new land and the carved water from a single commit", () => {
    const result = paint([river()], [1500, 700], [1500, 1300], 300);

    expect(result.landmasses).toHaveLength(1);
    expect(result.waters).toHaveLength(2);
    // The land the stroke laid genuinely spans the river's course.
    expect(
      pointInPolygon([result.landmasses[0].path, ...result.landmasses[0].holes], [1500, 1000]),
    ).toBe(true);
  });
});
