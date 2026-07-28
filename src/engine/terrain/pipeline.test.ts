import { describe, expect, it } from "vitest";
import { MASK_RESOLUTION } from "../geometry/coords";
import { polygonArea } from "../geometry/types";
import type { Landmass } from "../../scene/types";
import { createMask, stampMask } from "./mask";
import { terrainCommit } from "./pipeline";

/** A stroke, in map-space, stamped into a fresh mask at the fixed internal resolution. */
function stroke(from: [number, number], to: [number, number], brushSize = 300) {
  const mask = createMask(4000 * MASK_RESOLUTION, 3000 * MASK_RESOLUTION);
  const scale = ([x, y]: [number, number]): [number, number] => [
    x * MASK_RESOLUTION,
    y * MASK_RESOLUTION,
  ];
  return stampMask(mask, scale(from), scale(to), brushSize * MASK_RESOLUTION);
}

const commit = (
  mask: ReturnType<typeof stroke>,
  existingLand: Landmass[] = [],
  coastDetail = 0.5,
  mode: "paint" | "erase" = "paint",
) => terrainCommit({ mask, maskResolution: MASK_RESOLUTION, coastDetail, mode, existingLand });

const areaOf = (landmass: Landmass) => polygonArea([landmass.path, ...landmass.holes]);

describe("Pipeline A — brush commit", () => {
  it("turns a stroke into one editable landmass", () => {
    const land = commit(stroke([800, 800], [1600, 1200]));

    expect(land).toHaveLength(1);
    expect(land[0].type).toBe("landmass");
    expect(land[0].path.length).toBeGreaterThan(8);
    // A 300-wide stroke ~894 long: rectangle plus end caps, within vectorising slack.
    expect(areaOf(land[0])).toBeGreaterThan(300 * 894 * 0.8);
    expect(areaOf(land[0])).toBeLessThan(300 * 894 * 1.5);
  });

  it("unions overlapping strokes into a single coastline", () => {
    const first = commit(stroke([800, 800], [1600, 800]));
    const second = commit(stroke([1500, 800], [2300, 800]), first);

    expect(second).toHaveLength(1);
    expect(areaOf(second[0])).toBeGreaterThan(areaOf(first[0]));
  });

  it("keeps a detached stroke as a separate landmass", () => {
    const first = commit(stroke([600, 600], [900, 600]));
    const second = commit(stroke([3000, 2200], [3300, 2200]), first);

    expect(second).toHaveLength(2);
    expect(new Set(second.map((l) => l.id)).size).toBe(2);
  });

  it("carries identity: the larger piece keeps the id when a stroke is cut in two", () => {
    const painted = commit(stroke([600, 1500], [3000, 1500], 400));
    const named: Landmass[] = [{ ...painted[0], name: "Continent" }];

    const cut = commit(stroke([2600, 1200], [2600, 1800], 160), named, 0.5, "erase");
    const [largest, ...rest] = [...cut].sort((a, b) => areaOf(b) - areaOf(a));

    expect(cut.length).toBeGreaterThanOrEqual(2);
    expect(largest.id).toBe(named[0].id);
    expect(largest.name).toBe("Continent");
    expect(rest.every((piece) => piece.id !== named[0].id && !piece.name)).toBe(true);
  });

  it("punches a lake when erasing inside a landmass", () => {
    const painted = commit(stroke([1000, 1000], [2600, 1600], 700));
    const holed = commit(stroke([1800, 1300], [1850, 1330], 160), painted, 0.5, "erase");

    expect(holed).toHaveLength(1);
    expect(holed[0].holes.length).toBe(1);
  });

  it("makes the coast-detail slider change smoothness", () => {
    const path = stroke([700, 700], [2400, 1700], 420);
    const smooth = commit(path, [], 0);
    const detailed = commit(structuredClone(path), [], 1);

    expect(detailed[0].path.length).toBeGreaterThan(smooth[0].path.length);
    // Same landmass either way — detail changes the outline, not the shape.
    expect(areaOf(detailed[0]) / areaOf(smooth[0])).toBeCloseTo(1, 1);
  });

  it("no-ops on an empty stroke instead of dropping existing land", () => {
    const existing = commit(stroke([900, 900], [1200, 1200]));
    const empty = createMask(4000 * MASK_RESOLUTION, 3000 * MASK_RESOLUTION);
    expect(commit(empty, existing)).toBe(existing);
  });
});
