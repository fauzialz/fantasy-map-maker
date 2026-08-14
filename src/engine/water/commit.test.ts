import { describe, expect, it } from "vitest";
import { MASK_RESOLUTION } from "../geometry/coords";
import { multiPolygonArea, type Point } from "../geometry/types";
import { pointInPolygon } from "../geometry/nesting";
import { createMask, stampMask, type Mask } from "../terrain/mask";
import type { Water } from "../../scene/types";
import { mergeWater, splitWaterComponents, waterCommit } from "./commit";
import { waterToPolygon } from "./cut";

/**
 * WP-41 — the laying half of the water brush.
 *
 * The commit path is the landmass brush's, aimed at the other collection (`16` §5), so what is
 * worth asserting here is not the pipeline — `terrain/pipeline.test.ts` already covers every
 * stage of it — but the three things that are new: strokes **merge** (D10), identity travels by
 * ADR-10's larger-piece rule, and C1 holds after a **drag** as well as after a stroke.
 */

const CANVAS = { w: 800, h: 600 };

/** A brush stroke from a to b, in map units, exactly as `useSubstanceBrush` stamps one. */
const strokeMask = (a: Point, b: Point, brushSize: number): Mask => {
  const mask = createMask(
    Math.ceil(CANVAS.w * MASK_RESOLUTION),
    Math.ceil(CANVAS.h * MASK_RESOLUTION),
  );
  const toMask = ([x, y]: Point): Point => [x * MASK_RESOLUTION, y * MASK_RESOLUTION];
  stampMask(mask, toMask(a), toMask(b), brushSize * MASK_RESOLUTION);
  return mask;
};

const lay = (existingWater: Water[], a: Point, b: Point, brushSize = 60): Water[] =>
  waterCommit({
    mask: strokeMask(a, b, brushSize),
    maskResolution: MASK_RESOLUTION,
    coastDetail: 0.5,
    existingWater,
  });

const covers = (waters: Water[], point: Point) =>
  waters.some((water) => pointInPolygon(waterToPolygon(water), point));

describe("laying water", () => {
  it("turns one stroke into one water object", () => {
    const waters = lay([], [200, 300], [600, 300]);
    expect(waters).toHaveLength(1);
    expect(waters[0].type).toBe("water");
    expect(covers(waters, [400, 300])).toBe(true);
    expect(covers(waters, [400, 100])).toBe(false);
  });

  /**
   * **D10, and the headline of this package.** Two crossing strokes are one river system, not
   * two ribbons overlapping — the state `15` §1.2's defect needed is not representable, because
   * there is no second object to be wider than the first.
   */
  it("merges two overlapping strokes into one object", () => {
    const first = lay([], [200, 300], [600, 300]);
    const both = lay(first, [400, 150], [400, 450]);

    expect(first).toHaveLength(1);
    expect(both).toHaveLength(1);
    // The cross covers all four arms.
    for (const point of [
      [250, 300],
      [550, 300],
      [400, 200],
      [400, 400],
    ] as Point[]) {
      expect(covers(both, point)).toBe(true);
    }
  });

  it("keeps two strokes that never touch as two objects", () => {
    const first = lay([], [100, 150], [300, 150]);
    const both = lay(first, [100, 450], [300, 450]);
    expect(both).toHaveLength(2);
  });

  /**
   * ADR-10 through `claimComponents`, which WP-41 extracted so water and land answer this the
   * same way: the larger piece keeps the id. A tributary laid onto a trunk must not rename the
   * river system it joins.
   */
  it("gives the merged object the larger source's id", () => {
    const trunk = lay([], [100, 300], [700, 300]);
    const trunkId = trunk[0].id;
    const merged = lay(trunk, [400, 200], [400, 320], 30);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(trunkId);
  });

  it("leaves the existing collection alone when the stroke is empty", () => {
    const existing = lay([], [200, 300], [600, 300]);
    const empty = createMask(
      Math.ceil(CANVAS.w * MASK_RESOLUTION),
      Math.ceil(CANVAS.h * MASK_RESOLUTION),
    );
    expect(
      waterCommit({
        mask: empty,
        maskResolution: MASK_RESOLUTION,
        coastDetail: 0.5,
        existingWater: existing,
      }),
    ).toBe(existing);
  });
});

describe("mergeWater — C1 after a drag", () => {
  const bar = (id: string, x0: number, x1: number): Water => ({
    id,
    type: "water",
    path: [
      [x0, 280],
      [x1, 280],
      [x1, 320],
      [x0, 320],
    ],
    holes: [],
  });

  /**
   * A drop is as much a commit as a stroke: C1 says water never overlaps water **at rest**, and
   * dragging one body onto another is how that gets broken without a brush ever being used.
   */
  it("fuses two overlapping bodies, larger keeping its id", () => {
    const merged = mergeWater([bar("big", 100, 500), bar("small", 400, 600)]);
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("big");
    // 100→600 by 40 tall, with the overlap counted once rather than twice.
    expect(multiPolygonArea([waterToPolygon(merged[0])])).toBeCloseTo(500 * 40, 4);
  });

  it("leaves bodies that do not touch exactly as they were", () => {
    const apart = [bar("a", 100, 200), bar("b", 400, 500)];
    const merged = mergeWater(apart);
    expect(merged).toHaveLength(2);
    expect(merged.map((w) => w.id).sort()).toEqual(["a", "b"]);
  });

  /**
   * The short-circuit that made this worth its own function: `unionLand` hands a collection
   * straight back when the other side is empty, which is right for a stroke's disjoint contours
   * and silently wrong here. One object in, one object out — but by the union, not by the
   * shortcut.
   */
  it("is a no-op on a single object", () => {
    const one = [bar("a", 100, 200)];
    expect(mergeWater(one)).toBe(one);
  });
});

describe("splitWaterComponents", () => {
  it("winds holes opposite their outer, so an island in a lake reads as land", () => {
    const [water] = splitWaterComponents([
      [
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
        ],
        [
          [40, 40],
          [60, 40],
          [60, 60],
          [40, 60],
        ],
      ],
    ]);

    expect(water.holes).toHaveLength(1);
    // Even-odd through the ring: inside the hole is *not* inside the water.
    expect(pointInPolygon(waterToPolygon(water), [50, 50])).toBe(false);
    expect(pointInPolygon(waterToPolygon(water), [20, 50])).toBe(true);
  });
});
