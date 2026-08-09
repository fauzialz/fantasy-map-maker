import { describe, expect, it } from "vitest";
import { footprint, hasFootprint } from "../scene/bounds";
import type { Landmark, Landmass, Mountain, River, SceneObject, Tree } from "../scene/types";
import { isUnderBrush } from "./objectHit";

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
    const radius = 30;
    /**
     * Probe from between the two sprites' own reaches rather than at a literal distance.
     * The old fixture pressed at a fixed 80 units away, which silently encoded
     * `SPRITE_HEIGHT.mountain` — and broke the moment the art was retuned from 190 to 100,
     * reporting a defect in code that had not changed. The rule under test is "a bigger body
     * reaches further than a smaller one", and that is true at any art size.
     */
    const reach = (o: Mountain | Tree) => {
      const { left, right } = footprint(o);
      return radius + (right - left) * 0.3;
    };
    const away = (reach(big) + reach(small)) / 2;
    expect(isUnderBrush(big, [180 - away, 100], radius)).toBe(true);
    expect(isUnderBrush(small, [180 - away, 100], radius)).toBe(false);
  });

  it("picks up icons, which are sprites with a named variant", () => {
    const castle: Landmark = { ...at(100, 100), type: "landmark", kind: "castle" };
    expect(isUnderBrush(castle, [100, 100], 20)).toBe(true);
    expect(isUnderBrush(castle, [900, 900], 20)).toBe(false);
  });

  /**
   * WP-26 (ADR-37) reverses what this file used to assert. Path objects still have no
   * footprint — that part is unchanged and is why they need their own branch — but "no
   * footprint" no longer means "not erasable". It meant landmasses and rivers could not be
   * removed by any tool at all, which was the scoped eraser's real defect.
   */
  const square = (size: number): Landmass => ({
    id: "l",
    type: "landmass",
    path: [
      [0, 0],
      [size, 0],
      [size, size],
      [0, size],
    ],
    holes: [],
    biome: "grassland",
  });

  it("catches a landmass the brush is standing on", () => {
    const land = square(100);
    expect(hasFootprint(land as SceneObject)).toBe(false);
    expect(isUnderBrush(land, [50, 50], 5)).toBe(true);
  });

  it("catches one the brush only reaches from offshore, and misses one it cannot", () => {
    const land = square(100);
    expect(isUnderBrush(land, [130, 50], 40)).toBe(true);
    expect(isUnderBrush(land, [130, 50], 20)).toBe(false);
  });

  it("counts a lake shore as coastline", () => {
    const withLake: Landmass = {
      ...square(300),
      holes: [
        [
          [100, 100],
          [200, 100],
          [200, 200],
          [100, 200],
        ],
      ],
    };
    // Inside the lake is *outside* the land (even-odd), so only the reach finds it.
    expect(isUnderBrush(withLake, [150, 150], 5)).toBe(false);
    expect(isUnderBrush(withLake, [150, 150], 60)).toBe(true);
  });

  it("catches a river the brush crosses, and takes it whole", () => {
    const river: River = {
      id: "r",
      type: "river",
      points: [
        [0, 0],
        [200, 0],
      ],
      width: 20,
      taper: false,
      z: 0,
    };
    expect(isUnderBrush(river, [100, 5], 1)).toBe(true);
    expect(isUnderBrush(river, [100, 60], 20)).toBe(false);
    expect(isUnderBrush(river, [100, 60], 60)).toBe(true);
  });
});
