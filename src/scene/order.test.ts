import { describe, expect, it } from "vitest";
import { compareDrawOrder, inDrawOrder } from "./order";
import type { Mountain, SceneObject, Tree } from "./types";

const tree = (id: string, y: number, scale = 1, z = 0): Tree => ({
  id,
  type: "tree",
  x: 0,
  y,
  rotation: 0,
  scale,
  z,
  variant: 0,
});

const mountain = (id: string, y: number, scale = 1, z = 0): Mountain => ({
  ...tree(id, y, scale, z),
  type: "mountain",
});

const ids = (objects: SceneObject[]) => inDrawOrder(objects).map((object) => object.id);

describe("draw order (z, y, scale)", () => {
  it("puts objects lower on the map in front", () => {
    expect(ids([tree("far", 900), tree("near", 100)])).toEqual(["near", "far"]);
  });

  it("breaks ties by scale, so the bigger tree sits in front", () => {
    expect(ids([tree("small", 500, 0.8), tree("big", 500, 1.6)])).toEqual(["small", "big"]);
  });

  it("lets manual z override both", () => {
    // "near" is lower on the map and bigger, but "sent forward" wins.
    expect(ids([tree("near", 900, 2), tree("forward", 100, 0.5, 1)])).toEqual(["near", "forward"]);
    expect(ids([tree("back", 100, 1, -1), tree("normal", 900)])).toEqual(["back", "normal"]);
  });

  it("orders a scattered range front-to-back regardless of creation order", () => {
    const range = [mountain("c", 700), mountain("a", 100), mountain("d", 900), mountain("b", 400)];
    expect(ids(range)).toEqual(["a", "b", "c", "d"]);
  });

  it("does not mutate the scene's array order", () => {
    const objects = [tree("b", 900), tree("a", 100)];
    inDrawOrder(objects);
    expect(objects.map((o) => o.id)).toEqual(["b", "a"]);
  });

  it("treats path-based objects as neutral rather than throwing", () => {
    const river: SceneObject = {
      id: "r",
      type: "river",
      points: [
        [0, 0],
        [10, 10],
      ],
      width: 10,
      taper: true,
      z: 0,
    };
    expect(compareDrawOrder(river, tree("t", 0))).toBe(0);
  });
});
