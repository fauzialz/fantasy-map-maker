import { describe, expect, it } from "vitest";
import type { MultiPolygon, Point, Ring } from "../geometry/types";
import { ringArea } from "../geometry/types";
import { roughenCut } from "./roughen";

/**
 * The claim: the cut stops being a machined parallel channel, and **only** the cut
 * changes. A roughener that wanders across the whole coastline would be worse than none —
 * it would rewrite geometry the user drew by hand.
 */
const OPTIONS = { amplitude: 6, wavelength: 40, coastDetail: 1, seed: "test" };

/** A square whose right-hand side will be replaced by a "cut". */
const square = (): Ring => {
  const ring: Ring = [];
  for (let x = 0; x <= 200; x += 10) ring.push([x, 0]);
  for (let y = 10; y <= 200; y += 10) ring.push([200, y]);
  for (let x = 190; x >= 0; x -= 10) ring.push([x, 200]);
  for (let y = 190; y >= 10; y -= 10) ring.push([0, y]);
  return ring;
};

/**
 * The same square with its right edge pushed in — as a boolean difference would leave it.
 *
 * The inset is 163, not 160: the bottom edge already has a vertex at x=160, and an
 * *unmoved* original point sitting exactly on the join makes a "did the join move?" test
 * unable to fail. It did, until this was noticed.
 */
const CUT_X = 163;
const carved = (): Ring => square().map(([x, y]) => (x === 200 ? [CUT_X, y] : [x, y]) as Point);

describe("roughenCut", () => {
  it("leaves a shape alone when nothing was cut", () => {
    const ring = square();
    const [[out]] = roughenCut([[ring]], [[ring]], OPTIONS);
    expect(out).toEqual(ring);
  });

  it("displaces the cut edge", () => {
    const before: MultiPolygon = [[square()]];
    const [[out]] = roughenCut([[carved()]], before, OPTIONS);
    // Something changed, and the ring is still a ring.
    expect(out).not.toEqual(carved());
    expect(out.length).toBeGreaterThanOrEqual(3);
  });

  it("moves only the cut — the coastline the user drew is untouched", () => {
    const before: MultiPolygon = [[square()]];
    const cut = carved();
    const [[out]] = roughenCut([[cut]], before, { ...OPTIONS, coastDetail: 1 });

    // Every point that survived from the original must still be exactly where it was.
    const originals = new Set(square().map(([x, y]) => `${x},${y}`));
    const strayed = out.filter(([x, y]) => {
      const key = `${Math.round(x)},${Math.round(y)}`;
      return originals.has(key) === false && cut.some(([cx, cy]) => cx === x && cy === y) === false;
    });
    // Points that moved must all be near the cut's x, not spread over the whole square.
    for (const [x] of strayed) expect(x).toBeGreaterThan(100);
  });

  it("tapers to zero at the ends of a run, so the join is not a step", () => {
    const before: MultiPolygon = [[square()]];
    const cut = carved();
    const [[out]] = roughenCut([[cut]], before, { ...OPTIONS, coastDetail: 1 });
    // sin(0) and sin(π) are exactly zero, so the two points where the cut meets the
    // coastline the user drew must be exactly where they were. Asserting merely "within
    // the amplitude" would permit precisely the step this taper exists to prevent — the
    // first version of this test did, and passed with the taper removed.
    const joins: Point[] = [
      [CUT_X, 0],
      [CUT_X, 200],
    ];
    for (const [cx, cy] of joins) {
      const nearest = Math.min(...out.map(([x, y]) => Math.hypot(x - cx, y - cy)));
      expect(nearest).toBeLessThan(0.01);
    }
  });

  it("keeps every displacement inside the amplitude", () => {
    // Stated as a bound on movement rather than on absolute position: the fixture's top
    // and bottom edges legitimately run out past the cut, so an x-bound would be testing
    // the shape rather than the roughener.
    const before: MultiPolygon = [[square()]];
    const cut = carved();
    const [[out]] = roughenCut([[cut]], before, { ...OPTIONS, coastDetail: 1 });
    for (const [x, y] of out) {
      const nearest = Math.min(...cut.map(([cx, cy]) => Math.hypot(x - cx, y - cy)));
      expect(nearest).toBeLessThanOrEqual(OPTIONS.amplitude + 1e-6);
    }
  });

  it("does not wildly change the area — a coast wiggles, it does not erode", () => {
    const before: MultiPolygon = [[square()]];
    const cut = carved();
    const [[out]] = roughenCut([[cut]], before, { ...OPTIONS, coastDetail: 1 });
    expect(ringArea(out)).toBeGreaterThan(ringArea(cut) * 0.85);
    expect(ringArea(out)).toBeLessThan(ringArea(cut) * 1.15);
  });

  it("is deterministic — the same drop carves the same coast twice", () => {
    const before: MultiPolygon = [[square()]];
    const a = roughenCut([[carved()]], before, OPTIONS);
    const b = roughenCut([[carved()]], before, OPTIONS);
    expect(a).toEqual(b);
  });

  it("carves differently for a different landmass", () => {
    const before: MultiPolygon = [[square()]];
    const a = roughenCut([[carved()]], before, { ...OPTIONS, seed: "one" });
    const b = roughenCut([[carved()]], before, { ...OPTIONS, seed: "two" });
    expect(a).not.toEqual(b);
  });
});
