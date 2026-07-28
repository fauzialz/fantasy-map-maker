import { describe, expect, it } from "vitest";
import { boundsOf, objectBounds } from "./bounds";
import { SPRITE_HEIGHT } from "../sprites/registry";
import { restack, rotateObjects, scaleObjects, translateObjects } from "./transform";
import type { Landmass, Mountain, SceneObject, Tree } from "./types";

const tree = (id: string, x: number, y: number, scale = 1, z = 0): Tree => ({
  id,
  type: "tree",
  x,
  y,
  rotation: 0,
  scale,
  z,
  variant: 0,
});

const land: Landmass = {
  id: "land",
  type: "landmass",
  path: [
    [0, 0],
    [100, 0],
    [100, 100],
  ],
  holes: [],
  biome: "grassland",
};

describe("translateObjects", () => {
  it("moves a whole selection as one", () => {
    const moved = translateObjects([tree("a", 100, 100), tree("b", 300, 200)], 50, -20);
    expect(moved.map((o) => [o.x, o.y])).toEqual([
      [150, 80],
      [350, 180],
    ]);
  });

  it("leaves path-based objects alone", () => {
    expect(translateObjects([land], 50, 50)[0]).toBe(land);
  });
});

describe("scaleObjects", () => {
  it("spreads positions from the origin and grows each object", () => {
    const [a, b] = scaleObjects([tree("a", 100, 100), tree("b", 300, 100)], { x: 200, y: 100 }, 2);
    expect([a.x, b.x]).toEqual([0, 400]);
    expect(a.scale).toBe(2);
  });

  it("refuses to collapse objects to nothing", () => {
    const [a] = scaleObjects([tree("a", 100, 100, 1)], { x: 100, y: 100 }, 0);
    expect(a.scale).toBeGreaterThan(0);
  });

  it("is idempotent from the snapshot, so a drag cannot drift", () => {
    const start = [tree("a", 100, 100)];
    const origin = { x: 0, y: 0 };
    expect(scaleObjects(scaleObjects(start, origin, 3), origin, 1)).toEqual(
      scaleObjects(start, origin, 3),
    );
  });
});

describe("rotateObjects", () => {
  it("swings positions about the origin and turns each object", () => {
    const [a] = rotateObjects([tree("a", 100, 0)], { x: 0, y: 0 }, 90);
    expect(a.x).toBeCloseTo(0);
    expect(a.y).toBeCloseTo(100);
    expect(a.rotation).toBe(90);
  });

  it("keeps the selection rigid — distances from the origin are preserved", () => {
    const before = [tree("a", 100, 0), tree("b", 0, 200)];
    const after = rotateObjects(before, { x: 0, y: 0 }, 37);
    before.forEach((object, i) => {
      expect(Math.hypot(after[i].x, after[i].y)).toBeCloseTo(Math.hypot(object.x, object.y));
    });
  });
});

describe("restack", () => {
  const objects = [tree("a", 0, 0, 1, 0), tree("b", 0, 0, 1, 3), tree("c", 0, 0, 1, -2)];

  it("brings the selection above everything else", () => {
    const after = restack(objects, new Set(["a"]), 1);
    expect(after.find((o) => o.id === "a")?.z).toBe(4);
  });

  it("sends the selection below everything else", () => {
    const after = restack(objects, new Set(["b"]), -1);
    expect(after.find((o) => o.id === "b")?.z).toBe(-3);
  });

  it("leaves unselected objects untouched", () => {
    const after = restack(objects, new Set(["a"]), 1);
    expect(after.find((o) => o.id === "b")?.z).toBe(3);
  });
});

/**
 * Geometry the assertions below are derived from. Tree variant 0's body spans y 8..88 and
 * x 26..74 on the 100-unit grid; the stroke adds 1.3 either side. One grid unit is
 * SPRITE_HEIGHT / BASELINE map units.
 */
const UNIT = SPRITE_HEIGHT.tree / 88;
const TREE_HEIGHT = (88 - 8 + 2.6) * UNIT;
const TREE_WIDTH = (74 - 26 + 2.6) * UNIT;
/** How far the stroke spills past the baseline, below the anchor. */
const STROKE_BELOW = 1.3 * UNIT;

describe("bounds", () => {
  it("stands the box on the anchor, give or take the stroke", () => {
    const box = objectBounds(tree("a", 100, 500))!;
    expect(box.maxY).toBeCloseTo(500 + STROKE_BELOW, 1);
    expect(box.minY).toBeLessThan(500);
    expect((box.minX + box.maxX) / 2).toBeCloseTo(100);
  });

  it("grows with scale", () => {
    const small = objectBounds(tree("a", 0, 0, 1))!;
    const big = objectBounds(tree("b", 0, 0, 2))!;
    expect(big.maxX - big.minX).toBeCloseTo((small.maxX - small.minX) * 2);
  });

  it("unions a selection into one frame", () => {
    const frame = boundsOf([tree("a", 0, 0), tree("b", 1000, 800)])!;
    expect(frame.minX).toBeLessThan(0);
    expect(frame.maxX).toBeGreaterThan(1000);
    expect(frame.maxY).toBeCloseTo(800 + STROKE_BELOW, 1);
  });

  it("has no frame when nothing selectable is selected", () => {
    expect(boundsOf([])).toBeUndefined();
    expect(boundsOf([land as SceneObject])).toBeUndefined();
  });

  it("covers mountains as well as trees", () => {
    const peak: Mountain = { ...tree("m", 0, 0), type: "mountain" };
    expect(objectBounds(peak)).toBeDefined();
  });

  it("measures the artwork, not the grid it was drawn on", () => {
    // The 100x100 grid leaves 8 units empty above this tree. Counting them left visible
    // slack at the top of the selection frame.
    const box = objectBounds(tree("a", 0, 0))!;
    expect(box.maxY - box.minY).toBeCloseTo(TREE_HEIGHT, 1);
    expect(box.maxX - box.minX).toBeCloseTo(TREE_WIDTH, 1);
  });

  it("centres on the artwork, even when it sits off-centre on the grid", () => {
    // Mountain variant 0 spans x 4..72, so its centre is 38, not the grid's 50.
    const peak: Mountain = { ...tree("m", 500, 500), type: "mountain", variant: 0 };
    const box = objectBounds(peak)!;
    expect((box.minX + box.maxX) / 2).toBeCloseTo(500, 6);
  });

  /**
   * The renderer rotates about the anchor, so the bounds must too. When they disagreed,
   * the selection frame and every hit test described a sprite that was no longer there.
   */
  describe("under rotation", () => {
    it("turns the box upside down at 180°", () => {
      const box = objectBounds({ ...tree("a", 500, 500), rotation: 180 })!;
      expect(box.minY).toBeCloseTo(500 - STROKE_BELOW, 1);
      expect(box.maxY).toBeCloseTo(500 + TREE_HEIGHT - STROKE_BELOW, 1);
    });

    it("lays the box on its side at 90°", () => {
      const upright = objectBounds(tree("a", 500, 500))!;
      const turned = objectBounds({ ...tree("a", 500, 500), rotation: 90 })!;
      expect(turned.maxX - turned.minX).toBeCloseTo(upright.maxY - upright.minY);
      expect(turned.maxY - turned.minY).toBeCloseTo(upright.maxX - upright.minX);
    });

    it("keeps the anchor inside the box at every angle", () => {
      for (let angle = 0; angle < 360; angle += 15) {
        const box = objectBounds({ ...tree("a", 500, 500), rotation: angle })!;
        expect(box.minX).toBeLessThanOrEqual(500.001);
        expect(box.maxX).toBeGreaterThanOrEqual(499.999);
        expect(box.minY).toBeLessThanOrEqual(500.001);
        expect(box.maxY).toBeGreaterThanOrEqual(499.999);
      }
    });
  });
});
