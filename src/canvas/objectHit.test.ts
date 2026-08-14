import { describe, expect, it } from "vitest";
import { footprint, hasFootprint } from "../scene/bounds";
import type { Landmark, Landmass, Mountain, SceneObject, Tree, Water } from "../scene/types";
import { crowded, isUnderBrush } from "./objectHit";

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
   * removed by any tool at all, which was the scoped eraser's real defect. Since WP-40 both
   * substances answer through the same outline test, because they are the same shape.
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

  it("catches a water body the brush crosses, and takes it whole", () => {
    const channel: Water = {
      id: "w",
      type: "water",
      path: [
        [0, 0],
        [200, 0],
        [200, 20],
        [0, 20],
      ],
      holes: [],
    };
    // Inside the outline, nowhere near an edge — the point-in-polygon half.
    expect(isUnderBrush(channel, [100, 10], 1)).toBe(true);
    // Outside, and further than the disc reaches.
    expect(isUnderBrush(channel, [100, 80], 20)).toBe(false);
    // Outside, but the disc overlaps the bank — the ring-walk half.
    expect(isUnderBrush(channel, [100, 80], 70)).toBe(true);
  });
});

/**
 * WP-35 — the scatter brush's rejection radius. `SPRITE_HEIGHT` is **84 for a tree** and
 * **100 for a mountain**, so the numbers below are chosen against those rather than round.
 */
describe("crowded", () => {
  it("is off at 0, which is the pre-WP-35 brush exactly", () => {
    expect(crowded(at(0, 0), [at(0, 0)], 0)).toBe(false);
  });

  it("rejects a sibling inside the radius and allows one outside it", () => {
    // fraction 0.5 × mean height 84 = 42 units between two same-size trees.
    expect(crowded(at(41, 0), [at(0, 0)], 0.5)).toBe(true);
    expect(crowded(at(43, 0), [at(0, 0)], 0.5)).toBe(false);
  });

  it("measures the pair, not the candidate — a big neighbour pushes further", () => {
    // A 3× tree is 252 high; against a 1× candidate the gap is 0.5 × (84 + 252) / 2 = 84.
    expect(crowded(at(83, 0), [at(0, 0, 3)], 0.5)).toBe(true);
    // The same distance is clear of a same-size one, which is the case a single radius misses.
    expect(crowded(at(83, 0), [at(0, 0)], 0.5)).toBe(false);
  });

  it("ignores another kind — trees at the foot of a mountain read correctly", () => {
    expect(crowded(at(5, 0), [peak(0, 0)], 1)).toBe(false);
  });

  it("ignores objects with no art constant to measure against", () => {
    const label: SceneObject = {
      id: "l",
      type: "label",
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      z: 0,
      text: "Ardenmoor",
      font: "fantasy-serif",
      size: 96,
      pathId: null,
    };
    expect(crowded(label, [label], 1)).toBe(false);
  });

  it("scales with the fraction, so the knob means something at both ends", () => {
    expect(crowded(at(60, 0), [at(0, 0)], 0.5)).toBe(false); // gap 42
    expect(crowded(at(60, 0), [at(0, 0)], 1.5)).toBe(true); // gap 126
  });
});
