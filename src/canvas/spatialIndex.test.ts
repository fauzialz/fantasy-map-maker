import { describe, expect, it } from "vitest";
import { coversPoint, objectBounds } from "../scene/bounds";
import type { Landmark, Tree } from "../scene/types";
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

const compass = (x: number, y: number): Landmark => ({
  id: "compass",
  type: "landmark",
  kind: "compass",
  x,
  y,
  rotation: 0,
  scale: 1,
  z: 0,
});

/**
 * WP-21 / ADR-30. The box narrows the field, the drawn shape decides between the
 * candidates, and topmost-by-Y is what is left when nothing's artwork is under the point.
 */
describe("SpatialIndex.hit — the drawn shape decides", () => {
  it("prefers the sprite whose artwork covers the point over the topmost box", () => {
    // A compass rose is a four-armed star: 28% ink, so its box corners are open space.
    const rose = compass(1000, 1000);
    const box = objectBounds(rose);
    if (!box) throw new Error("expected a footprint");
    const point: [number, number] = [
      box.minX + (box.maxX - box.minX) * 0.1,
      box.minY + (box.maxY - box.minY) * 0.1,
    ];
    // A tree whose foliage really is under that point, standing higher up the map.
    const conifer = tree("tree", point[0], point[1] + 50);

    // Premises — without these the assertion below could pass for the wrong reason.
    expect(coversPoint(rose, ...point)).toBe(false);
    expect(coversPoint(conifer, ...point)).toBe(true);
    expect(rose.y).toBeGreaterThan(conifer.y); // so topmost-by-Y alone would say "compass"

    const index = new SpatialIndex([conifer, rose]);
    expect(index.hit(...point)?.id).toBe("tree");
  });

  it("still picks an isolated sprite from a near miss — a tie-break, not a filter (P2)", () => {
    // Nothing else is under the point, so precision has no ambiguity to resolve and the
    // box stays in charge. Demanding an exact silhouette hit would make a sprite that is
    // a few pixels at fit zoom harder to select, not easier.
    const rose = compass(1000, 1000);
    const box = objectBounds(rose);
    if (!box) throw new Error("expected a footprint");
    const point: [number, number] = [
      box.minX + (box.maxX - box.minX) * 0.1,
      box.minY + (box.maxY - box.minY) * 0.1,
    ];
    expect(coversPoint(rose, ...point)).toBe(false);
    expect(new SpatialIndex([rose]).hit(...point)?.id).toBe("compass");
  });

  it("keeps the marquee on boxes — silhouettes never narrow a `within`", () => {
    const rose = compass(1000, 1000);
    const box = objectBounds(rose);
    if (!box) throw new Error("expected a footprint");
    expect(new SpatialIndex([rose]).within(box).map((object) => object.id)).toEqual(["compass"]);
  });
});
