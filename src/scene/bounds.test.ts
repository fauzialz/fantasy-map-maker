import { describe, expect, it } from "vitest";
import {
  boundsCenter,
  boundsContainPoint,
  coversPoint,
  objectBounds,
  standingOn,
  type Bounds,
  type PlacedObject,
} from "./bounds";
import type { Label, Landmark, Landmass, Mountain, Ring, SceneObject, Tree, Water } from "./types";

const square = (x: number, y: number, size: number): Ring => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];

const land = (id: string, path: Ring, holes: Ring[] = []): Landmass => ({
  id,
  type: "landmass",
  path,
  holes,
  biome: "grassland",
});

const tree = (id: string, x: number, y: number): Tree => ({
  id,
  type: "tree",
  x,
  y,
  rotation: 0,
  scale: 1,
  z: 0,
  variant: 0,
});

/**
 * WP-19's double-click. The lake case is the one worth a fixture: even-odd through the
 * holes is what stops a continent claiming the island in its own lake, and it is the same
 * property `landmassAt` relies on — so a change that breaks one breaks both.
 */
describe("standingOn", () => {
  const continent = land("c", square(0, 0, 1000), [square(400, 400, 200)]);
  const inland = tree("inland", 100, 100);
  const inLake = tree("in-lake", 500, 500);
  const atSea = tree("at-sea", 2000, 2000);

  it("takes the objects anchored on the land and leaves the rest", () => {
    const ids = standingOn(continent, [inland, inLake, atSea]).map((object) => object.id);
    expect(ids).toEqual(["inland"]);
  });

  it("never takes a path object — a river crossing land is not standing on it", () => {
    const river: Water = {
      id: "r",
      type: "water",
      path: square(100, 100, 800),
      holes: [],
    };
    const objects: SceneObject[] = [river, land("other", square(100, 100, 50)), inland];
    expect(standingOn(continent, objects).map((object) => object.id)).toEqual(["inland"]);
  });
});

/** A point at a fraction across an object's box — so the premises below are box-relative. */
const inBox = (bounds: Bounds, fx: number, fy: number): [number, number] => [
  bounds.minX + (bounds.maxX - bounds.minX) * fx,
  bounds.minY + (bounds.maxY - bounds.minY) * fy,
];

const boxOf = (object: PlacedObject): Bounds => {
  const bounds = objectBounds(object);
  if (!bounds) throw new Error("expected a footprint");
  return bounds;
};

const compass = (x: number, y: number, rotation = 0, scale = 1): Landmark => ({
  id: "compass",
  type: "landmark",
  kind: "compass",
  x,
  y,
  rotation,
  scale,
  z: 0,
});

const mountain = (id: string, x: number, y: number, variant = 0): Mountain => ({
  id,
  type: "mountain",
  x,
  y,
  rotation: 0,
  scale: 1,
  z: 0,
  variant,
});

describe("coversPoint", () => {
  it("is false between a compass's arms and true at its centre — the box is not the shape", () => {
    const rose = compass(1000, 1000);
    const box = boxOf(rose);
    const corner = inBox(box, 0.1, 0.1);

    // Premise: the corner really is inside the box, or this proves nothing.
    expect(boundsContainPoint(box, ...corner)).toBe(true);

    expect(coversPoint(rose, ...corner)).toBe(false);
    const centre = boundsCenter(box);
    expect(coversPoint(rose, centre.x, centre.y)).toBe(true);
  });

  it("is false in the empty sky above a mountain's slope", () => {
    const peak = mountain("m", 1000, 1000);
    const box = boxOf(peak);
    expect(coversPoint(peak, ...inBox(box, 0.08, 0.08))).toBe(false);
    const centre = boundsCenter(box);
    expect(coversPoint(peak, centre.x, centre.y)).toBe(true);
  });

  it("follows rotation — a tree turned 180° leaves the space above its anchor empty", () => {
    const upright = tree("t", 1000, 1000);
    const centre = boundsCenter(boxOf(upright));
    expect(coversPoint(upright, centre.x, centre.y)).toBe(true);
    // Same world point; the artwork now hangs below the anchor it spun about.
    expect(coversPoint({ ...upright, rotation: 180 }, centre.x, centre.y)).toBe(false);
  });

  it("follows scale — the same grid spot stays covered when the sprite grows", () => {
    const small = tree("t", 1000, 1000);
    const big = { ...small, scale: 3 };
    for (const object of [small, big]) {
      const centre = boundsCenter(boxOf(object));
      expect(coversPoint(object, centre.x, centre.y)).toBe(true);
    }
    // A point in the big tree's foliage is empty space beside the small one.
    const far = boundsCenter(boxOf(big));
    expect(coversPoint(small, far.x, far.y)).toBe(false);
  });

  it("exempts labels: the gap between two words is still the label (ADR-30 F2)", () => {
    const label: Label = {
      id: "L",
      type: "label",
      x: 1000,
      y: 1000,
      rotation: 0,
      scale: 1,
      z: 0,
      text: "Ardh Vale",
      font: "fantasy-serif",
      size: 96,
      pathId: null,
    };
    const box = boxOf(label);
    // Anywhere inside the box, including the whitespace between the words.
    expect(coversPoint(label, ...inBox(box, 0.5, 0.5))).toBe(true);
    expect(coversPoint(label, ...inBox(box, 0.02, 0.98))).toBe(true);
  });
});
