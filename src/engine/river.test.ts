import { describe, expect, it } from "vitest";
import type { Point, River } from "../scene/types";
import { distanceToRiver, isOnRiver, riverCentreline, riverRibbon } from "./river";

const river = (points: Point[], overrides: Partial<River> = {}): River => ({
  id: "r",
  type: "river",
  points,
  width: 40,
  taper: true,
  z: 0,
  ...overrides,
});

/** A straight river running east, so every offset is purely vertical and easy to assert. */
const straight = (overrides: Partial<River> = {}) =>
  river(
    [
      [0, 100],
      [200, 100],
      [400, 100],
    ],
    overrides,
  );

describe("river centreline", () => {
  it("pins the endpoints the user clicked", () => {
    const points: Point[] = [
      [0, 0],
      [100, 100],
      [200, 0],
    ];
    const line = riverCentreline(points);
    expect(line[0]).toEqual([0, 0]);
    expect(line[line.length - 1]).toEqual([200, 0]);
  });

  it("rounds the corner off rather than passing through it", () => {
    const line = riverCentreline([
      [0, 0],
      [100, 100],
      [200, 0],
    ]);
    // The apex is cut, so nothing reaches the clicked corner.
    expect(Math.max(...line.map(([, y]) => y))).toBeLessThan(100);
  });
});

describe("river ribbon", () => {
  it("gives both banks a point per centreline point", () => {
    const line = riverCentreline(straight().points);
    expect(riverRibbon(straight())).toHaveLength(line.length * 2);
  });

  it("straddles the centreline by the half-width", () => {
    const flat = straight({ taper: false });
    const ribbon = riverRibbon(flat);
    const offsets = ribbon.map(([, y]) => Math.abs(y - 100));
    for (const offset of offsets) expect(offset).toBeCloseTo(flat.width / 2, 6);
  });

  it("runs narrow at the source and full width at the mouth", () => {
    const ribbon = riverRibbon(straight());
    // The outline starts at the source on one bank and ends at the source on the other.
    const atSource = Math.abs(ribbon[0][1] - 100);
    const atMouth = Math.abs(ribbon[ribbon.length / 2 - 1][1] - 100);
    expect(atSource).toBeLessThan(atMouth);
    expect(atMouth).toBeCloseTo(20, 6);
  });

  it("has nothing to outline with fewer than two points", () => {
    expect(riverRibbon(river([[10, 10]]))).toEqual([]);
  });
});

describe("river hit-testing", () => {
  it("is zero on the line and grows with distance", () => {
    expect(distanceToRiver(straight(), [200, 100])).toBeCloseTo(0, 6);
    expect(distanceToRiver(straight(), [200, 160])).toBeCloseTo(60, 6);
  });

  it("measures to the nearest segment, not the nearest clicked point", () => {
    // Halfway along a long segment: far from both endpoints, right on the line.
    expect(
      distanceToRiver(
        river([
          [0, 0],
          [1000, 0],
        ]),
        [500, 5],
      ),
    ).toBeCloseTo(5, 6);
  });

  it("counts a point inside the river's own width as a hit", () => {
    expect(isOnRiver(straight(), [200, 115])).toBe(true);
    expect(isOnRiver(straight(), [200, 400])).toBe(false);
  });
});
