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
  /**
   * WP-29 added a rounded mouth (`13` D6), so the outline is both banks *plus* the arc that
   * closes them: `CAP_STEPS - 1` interior points. These three fixtures counted on the bare
   * two-bank outline — the bank arithmetic they actually test is unchanged, so they now index
   * the banks explicitly instead of assuming the outline is nothing else.
   */
  const CAP_POINTS = 5;
  const banks = (ribbon: Point[], line: Point[]) => ({
    left: ribbon.slice(0, line.length),
    right: ribbon.slice(line.length + CAP_POINTS),
  });

  it("gives both banks a point per centreline point, plus the cap that closes them", () => {
    const line = riverCentreline(straight().points);
    expect(riverRibbon(straight())).toHaveLength(line.length * 2 + CAP_POINTS);
  });

  it("straddles the centreline by the half-width", () => {
    const flat = straight({ taper: false });
    const line = riverCentreline(flat.points);
    const { left, right } = banks(riverRibbon(flat), line);
    for (const [, y] of [...left, ...right]) {
      expect(Math.abs(y - 100)).toBeCloseTo(flat.width / 2, 6);
    }
  });

  it("runs narrow at the source and full width at the mouth", () => {
    const flowing = straight();
    const line = riverCentreline(flowing.points);
    const { left } = banks(riverRibbon(flowing), line);
    const atSource = Math.abs(left[0][1] - 100);
    const atMouth = Math.abs(left[left.length - 1][1] - 100);
    expect(atSource).toBeLessThan(atMouth);
    expect(atMouth).toBeCloseTo(20, 6);
  });

  it("closes the mouth with an arc that bulges past the last centreline point", () => {
    const flowing = straight();
    const line = riverCentreline(flowing.points);
    const cap = riverRibbon(flowing).slice(line.length, line.length + CAP_POINTS);
    const mouth = line[line.length - 1];
    expect(cap).toHaveLength(CAP_POINTS);
    // Every cap point sits on the circle of the mouth's half-width, and the apex is downstream.
    for (const [x, y] of cap) {
      expect(Math.hypot(x - mouth[0], y - mouth[1])).toBeCloseTo(20, 6);
    }
    expect(Math.max(...cap.map(([x]) => x))).toBeGreaterThan(mouth[0]);
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
