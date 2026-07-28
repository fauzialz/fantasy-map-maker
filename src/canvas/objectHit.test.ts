import { describe, expect, it } from "vitest";
import type { Mountain, SceneObject, Tree } from "../scene/types";
import { isSpriteObject, isUnderBrush } from "./objectHit";

const at = (x: number, y: number, scale = 1): Tree => ({
  id: "t",
  type: "tree",
  x,
  y,
  rotation: 0,
  scale,
  z: 0,
  variant: 0,
});
const peak = (x: number, y: number, scale = 1): Mountain => ({
  ...at(x, y, scale),
  type: "mountain",
});

describe("object eraser hit-test", () => {
  it("picks up objects inside the brush", () => {
    expect(isUnderBrush(at(100, 100), [100, 100], 50)).toBe(true);
    expect(isUnderBrush(at(140, 100), [100, 100], 50)).toBe(true);
  });

  it("leaves objects well outside it alone", () => {
    expect(isUnderBrush(at(600, 600), [100, 100], 50)).toBe(false);
  });

  it("counts the footprint, so a big mountain under the cursor is caught by its body", () => {
    // A large mountain's feet sit outside the brush, but its body is right under it.
    const big = peak(180, 100, 2);
    const small = at(180, 100, 0.5);
    expect(isUnderBrush(big, [100, 100], 30)).toBe(true);
    expect(isUnderBrush(small, [100, 100], 30)).toBe(false);
  });

  it("ignores objects the sprite renderer does not draw", () => {
    const landmass: SceneObject = {
      id: "l",
      type: "landmass",
      path: [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      holes: [],
      biome: "grassland",
    };
    expect(isSpriteObject(landmass)).toBe(false);
    expect(isUnderBrush(landmass, [5, 5], 500)).toBe(false);
  });
});
