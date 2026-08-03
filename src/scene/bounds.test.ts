import { describe, expect, it } from "vitest";
import { standingOn } from "./bounds";
import type { Landmass, Ring, River, SceneObject, Tree } from "./types";

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
    const river: River = {
      id: "r",
      type: "river",
      points: [
        [100, 100],
        [900, 900],
      ],
      width: 20,
      taper: false,
      z: 0,
    };
    const objects: SceneObject[] = [river, land("other", square(100, 100, 50)), inland];
    expect(standingOn(continent, objects).map((object) => object.id)).toEqual(["inland"]);
  });
});
