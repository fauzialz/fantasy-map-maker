import { describe, expect, it } from "vitest";
import type { Tree } from "../scene/types";
import { SpatialIndex } from "./spatialIndex";

const tree = (id: string, x: number, y: number, scale = 1): Tree => ({
  id,
  type: "tree",
  x,
  y,
  rotation: 0,
  scale,
  z: 0,
  variant: 0,
});

describe("SpatialIndex", () => {
  it("finds the object under a point", () => {
    const index = new SpatialIndex([tree("a", 100, 100), tree("b", 900, 900)]);
    expect(index.hit(100, 99)?.id).toBe("a");
    expect(index.hit(2000, 2000)).toBeUndefined();
  });

  it("picks the topmost when objects overlap, matching the draw order", () => {
    // Same spot; the one lower on the map is drawn last, so it is what you clicked.
    const index = new SpatialIndex([tree("behind", 100, 100), tree("front", 100, 140)]);
    expect(index.hit(100, 100)?.id).toBe("front");
  });

  it("returns everything inside a marquee", () => {
    const objects = Array.from({ length: 50 }, (_, i) => tree(`t${i}`, i * 40, 500));
    const index = new SpatialIndex(objects);
    const inside = index.within({ minX: 0, minY: 0, maxX: 400, maxY: 600 });
    expect(inside.length).toBeGreaterThan(5);
    expect(inside.every((object) => "x" in object && object.x <= 400 + 100)).toBe(true);
  });

  it("stays usable at the perf budget", () => {
    const objects = Array.from({ length: 2000 }, (_, i) =>
      tree(`t${i}`, (i * 137) % 4000, (i * 291) % 3000),
    );
    const started = Date.now();
    const index = new SpatialIndex(objects);
    for (let i = 0; i < 200; i++) index.within({ minX: 0, minY: 0, maxX: 500, maxY: 500 });
    // 200 marquee queries over 2k objects — a drag's worth of frames.
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("ignores objects with no drawable bounds", () => {
    const index = new SpatialIndex([
      { id: "l", type: "landmass", path: [[0, 0]], holes: [], biome: "grassland" },
    ]);
    expect(index.hit(0, 0)).toBeUndefined();
  });
});
