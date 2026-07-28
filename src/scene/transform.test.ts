import { describe, expect, it } from "vitest";
import { boundsOf, objectBounds } from "./bounds";
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

describe("bounds", () => {
  it("anchors an object's box at its foot", () => {
    const box = objectBounds(tree("a", 100, 500))!;
    expect(box.maxY).toBe(500);
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
    expect(frame.maxY).toBe(800);
  });

  it("has no frame when nothing selectable is selected", () => {
    expect(boundsOf([])).toBeUndefined();
    expect(boundsOf([land as SceneObject])).toBeUndefined();
  });

  it("covers mountains as well as trees", () => {
    const peak: Mountain = { ...tree("m", 0, 0), type: "mountain" };
    expect(objectBounds(peak)).toBeDefined();
  });
});
