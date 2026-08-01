import { describe, expect, it } from "vitest";
import type { Landmass, Ring } from "../../scene/types";
import { rescaleCoast } from "./rescale";
import { chaikin, simplify } from "./smooth";

/**
 * `08` §4 T3's fixtures. The claim under test is about **density** — points per unit of
 * coastline — because that, not the raw count, is what makes a scaled coast read as
 * coarser than the one next to it.
 */

/** A wobbly closed ring, so simplification has something to decide about. */
function blob(radius: number, points = 220): Ring {
  const ring: Ring = [];
  for (let i = 0; i < points; i++) {
    const t = (i / points) * Math.PI * 2;
    const r = radius * (1 + 0.18 * Math.sin(t * 5) + 0.07 * Math.sin(t * 11));
    ring.push([Math.cos(t) * r, Math.sin(t) * r]);
  }
  return ring;
}

const perimeter = (ring: Ring): number => {
  let total = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    total += Math.hypot(x2 - x1, y2 - y1);
  }
  return total;
};

/** Points per 1000 map units of coast — the number the acceptance is really about. */
const density = (ring: Ring): number => (ring.length / perimeter(ring)) * 1000;

const land = (path: Ring, holes: Ring[] = []): Landmass => ({
  id: "l",
  type: "landmass",
  path,
  holes,
  biome: "grassland",
});

const scaleRing = (ring: Ring, factor: number): Ring =>
  ring.map(([x, y]) => [x * factor, y * factor] as Ring[number]);

const DETAIL = 0.5;
/** What the brush would have produced at this size: chaikin then simplify (S3 → S4). */
const freshlyCommitted = (radius: number): Ring => simplify(chaikin(blob(radius)), DETAIL);

describe("rescaleCoast", () => {
  it("keeps a scaled-up coast near the density of one painted at that size", () => {
    const committed = freshlyCommitted(300);
    const scaled = scaleRing(committed, 4);

    // Untreated, scaling stretches the same points over four times the coastline.
    expect(density(scaled)).toBeLessThan(density(committed) / 3);

    const fixed = rescaleCoast(land(scaled), 4, DETAIL).path;
    const target = density(freshlyCommitted(1200));
    expect(density(fixed)).toBeGreaterThan(target / 1.5);
    expect(density(fixed)).toBeLessThan(target * 1.5);
  });

  it("sheds points a shrunken coast can no longer show", () => {
    const committed = freshlyCommitted(1200);
    const scaled = scaleRing(committed, 0.25);
    const fixed = rescaleCoast(land(scaled), 0.25, DETAIL).path;
    expect(fixed.length).toBeLessThan(scaled.length);
  });

  it("does not grow the point count without bound across repeated cycles", () => {
    let current = land(freshlyCommitted(300));
    const counts: number[] = [];
    for (let i = 0; i < 6; i++) {
      current = rescaleCoast(land(scaleRing(current.path, 2)), 2, DETAIL);
      current = rescaleCoast(land(scaleRing(current.path, 0.5)), 0.5, DETAIL);
      counts.push(current.path.length);
    }
    // Six up-and-down round trips must not run away.
    expect(counts[counts.length - 1]).toBeLessThan(counts[0] * 2);
  });

  it("re-details lakes as well as the coastline", () => {
    const committed = freshlyCommitted(300);
    const lake = freshlyCommitted(80);
    const scaled = land(scaleRing(committed, 4), [scaleRing(lake, 4)]);
    const fixed = rescaleCoast(scaled, 4, DETAIL);
    expect(fixed.holes[0].length).toBeGreaterThan(scaled.holes[0].length);
  });

  it("drops a degenerate lake rather than carrying it along", () => {
    // Not a shrinking test: `simplify` never returns fewer than three points, so a lake
    // cannot be simplified out of existence. The guard is for a ring that arrives already
    // malformed — two points is not a hole, and a hole is a fill rule, not a decoration.
    const degenerate: Ring = [
      [0, 0],
      [0.2, 0],
    ];
    const fixed = rescaleCoast(land(freshlyCommitted(300), [degenerate]), 0.5, DETAIL);
    expect(fixed.holes).toHaveLength(0);
  });

  it("keeps a lake that is merely small — three points is still a lake", () => {
    const triangle: Ring = [
      [0, 0],
      [4, 0],
      [4, 4],
    ];
    const fixed = rescaleCoast(land(freshlyCommitted(300), [triangle]), 0.25, DETAIL);
    expect(fixed.holes).toHaveLength(1);
  });

  it("leaves a coast alone when nothing was scaled", () => {
    const committed = freshlyCommitted(300);
    const fixed = rescaleCoast(land(committed), 1, DETAIL);
    expect(fixed.path.length).toBe(committed.length);
  });

  it("respects the coast-detail setting — a rough map keeps more of what it had", () => {
    const committed = freshlyCommitted(300);
    const scaled = scaleRing(committed, 4);
    const smooth = rescaleCoast(land(scaled), 4, 0).path;
    const rough = rescaleCoast(land(scaled), 4, 1).path;
    expect(rough.length).toBeGreaterThan(smooth.length);
  });
});
