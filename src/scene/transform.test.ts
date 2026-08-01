import { describe, expect, it } from "vitest";
import { boundsOf, objectBounds } from "./bounds";
import { SPRITE_HEIGHT } from "../sprites/registry";
import { restack, rotateObjects, scaleObjects, translateObjects } from "./transform";
import type { Landmass, Mountain, River, SceneObject, Tree } from "./types";

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

/** A straight river running 200 units east, 20 wide. */
const river = (): River => ({
  id: "r",
  type: "river",
  points: [
    [0, 0],
    [100, 0],
    [200, 0],
  ],
  width: 20,
  taper: true,
  z: 0,
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

  /**
   * This file used to assert that *every* path-based object came back untouched — invariant
   * I9's original rule, and the right one while nothing could move them. WP-15 retired it
   * for landmasses and **WP-20 for rivers**, so the rule has narrowed all the way down to
   * what it was really protecting: a frame must never promise a drag the transform refuses.
   */
  it("no longer leaves path objects alone — that is the point of WP-15 and WP-20", () => {
    const stream = river();
    expect(translateObjects([land], 50, 50)[0]).not.toBe(land);
    expect(translateObjects([stream], 50, 50)[0]).not.toBe(stream);
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

/**
 * WP-15 — the second interaction model. A landmass has no anchor and no rotation field
 * (C5), so a transform has nowhere to record itself: it **bakes into the points**. These
 * pin the properties that makes that safe — rigid means area-preserving and reversible.
 */
describe("path-based transforms", () => {
  const square = (): Landmass => ({
    id: "l1",
    type: "landmass",
    path: [
      [100, 100],
      [300, 100],
      [300, 300],
      [100, 300],
    ],
    holes: [
      [
        [150, 150],
        [200, 150],
        [200, 200],
        [150, 200],
      ],
    ],
    biome: "grassland",
  });

  const area = (ring: [number, number][]) => {
    let sum = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];
      sum += x1 * y2 - x2 * y1;
    }
    return Math.abs(sum / 2);
  };

  it("translates every point of the coastline", () => {
    const [moved] = translateObjects([square()], 40, -25) as Landmass[];
    expect(moved.path).toEqual([
      [140, 75],
      [340, 75],
      [340, 275],
      [140, 275],
    ]);
  });

  it("carries lakes with their parent", () => {
    const [moved] = translateObjects([square()], 40, -25) as Landmass[];
    expect(moved.holes[0]).toEqual([
      [190, 125],
      [240, 125],
      [240, 175],
      [190, 175],
    ]);
  });

  it("leaves the original untouched — a drag transforms the snapshot (I6)", () => {
    const before = square();
    translateObjects([before], 999, 999);
    expect(before.path[0]).toEqual([100, 100]);
  });

  it("preserves area under rotation — rigid means rigid", () => {
    const before = square();
    const [after] = rotateObjects([before], { x: 200, y: 200 }, 37) as Landmass[];
    expect(area(after.path)).toBeCloseTo(area(before.path), 6);
    expect(area(after.holes[0])).toBeCloseTo(area(before.holes[0]), 6);
  });

  it("round-trips a 360° rotation to within a scaled integer unit", () => {
    const before = square();
    const [after] = rotateObjects([before], { x: 173, y: 241 }, 360) as Landmass[];
    for (const [i, [x, y]] of after.path.entries()) {
      expect(x).toBeCloseTo(before.path[i][0], 6);
      expect(y).toBeCloseTo(before.path[i][1], 6);
    }
  });

  it("rotates lakes about the same origin as their parent", () => {
    const before = square();
    const [after] = rotateObjects([before], { x: 0, y: 0 }, 90) as Landmass[];
    // (150,150) about the origin by 90° → (-150,150)
    expect(after.holes[0][0][0]).toBeCloseTo(-150, 6);
    expect(after.holes[0][0][1]).toBeCloseTo(150, 6);
  });

  it("scales a landmass about the origin — WP-16", () => {
    const before = square();
    const [after] = scaleObjects([before], { x: 0, y: 0 }, 2) as Landmass[];
    expect(after.path).toEqual([
      [200, 200],
      [600, 200],
      [600, 600],
      [200, 600],
    ]);
    expect(after.holes[0][0]).toEqual([300, 300]);
  });

  it("scales the points only — re-detailing happens on drop, in the worker (C3)", () => {
    // `scaleObjects` runs per frame; `rescaleCoast` runs once. Point count is untouched
    // here, which is what keeps a scale drag cheap.
    const before = square();
    const [after] = scaleObjects([before], { x: 0, y: 0 }, 4) as Landmass[];
    expect(after.path).toHaveLength(before.path.length);
  });

  /**
   * WP-20 — the same model on the object type where it costs nothing. A river's points are
   * the user's own control points, so nothing is baked at a tolerance and every transform
   * is reversible. The one thing that is *not* in the geometry is `width`, and that is
   * exactly where this can go wrong quietly.
   */
  describe("a river", () => {
    const polylineLength = (points: [number, number][]) => {
      let total = 0;
      for (let i = 0; i + 1 < points.length; i++) {
        total += Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1]);
      }
      return total;
    };

    it("translates every control point", () => {
      const [moved] = translateObjects([river()], 40, -25) as River[];
      expect(moved.points).toEqual([
        [40, -25],
        [140, -25],
        [240, -25],
      ]);
    });

    it("round-trips a 360° rotation", () => {
      const before = river();
      const [after] = rotateObjects([before], { x: 173, y: 241 }, 360) as River[];
      for (const [i, [x, y]] of after.points.entries()) {
        expect(x).toBeCloseTo(before.points[i][0], 6);
        expect(y).toBeCloseTo(before.points[i][1], 6);
      }
    });

    it("keeps its width through a rotation — turning a river does not thin it", () => {
      const [after] = rotateObjects([river()], { x: 0, y: 0 }, 90) as River[];
      expect(after.width).toBe(20);
      expect(after.points[2]).toEqual([expect.closeTo(0, 6), expect.closeTo(200, 6)]);
    });

    /**
     * The assertion this describe block exists for. Scaling the points alone leaves a
     * river twice as long and still drawn at the old width — a thread across the map, and
     * a silent one: every other property survives, the geometry is right, and it simply
     * stops reading as the same river.
     */
    it("scales its width along with its length", () => {
      const before = river();
      const [after] = scaleObjects([before], { x: 0, y: 0 }, 2) as River[];
      expect(after.width).toBe(40);
      expect(polylineLength(after.points)).toBeCloseTo(polylineLength(before.points) * 2, 6);
    });

    it("holds the ratio of width to length at any factor — the shape is the invariant", () => {
      const before = river();
      const ratio = before.width / polylineLength(before.points);
      for (const factor of [0.3, 1, 2.5, 7]) {
        const [after] = scaleObjects([before], { x: 500, y: 500 }, factor) as River[];
        expect(after.width / polylineLength(after.points)).toBeCloseTo(ratio, 6);
      }
    });

    it("carries taper through untouched — it is a fraction along the path", () => {
      const [after] = scaleObjects([river()], { x: 0, y: 0 }, 3) as River[];
      expect(after.taper).toBe(true);
    });

    it("moves alongside a landmass and a mountain in one call", () => {
      const mountain = {
        id: "m",
        type: "mountain" as const,
        x: 10,
        y: 20,
        rotation: 0,
        scale: 1,
        z: 0,
        variant: 0,
      };
      const [stream, coast, peak] = translateObjects([river(), square(), mountain], 5, 5) as [
        River,
        Landmass,
        typeof mountain,
      ];
      expect(stream.points[0]).toEqual([5, 5]);
      expect(coast.path[0]).toEqual([105, 105]);
      expect([peak.x, peak.y]).toEqual([15, 25]);
    });
  });

  it("moves a landmass and a mountain by the same delta in one call", () => {
    const mountain = {
      id: "m",
      type: "mountain" as const,
      x: 10,
      y: 20,
      rotation: 0,
      scale: 1,
      z: 0,
      variant: 0,
    };
    const [land, peak] = translateObjects([square(), mountain], 5, 5) as [
      Landmass,
      typeof mountain,
    ];
    expect(land.path[0]).toEqual([105, 105]);
    expect([peak.x, peak.y]).toEqual([15, 25]);
  });
});
