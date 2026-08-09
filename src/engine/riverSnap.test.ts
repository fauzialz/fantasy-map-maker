import { describe, expect, it } from "vitest";
import type { Landmass, Point, River } from "../scene/types";
import { riverCentreline } from "./river";
import { findSnap, MOUTH_APPROACH, MOUTH_OVERSHOOT, snapRiverEnd } from "./riverSnap";

/** Land filling y ≥ 200, so the coast is the horizontal line y = 200 and the sea is above it. */
const coast = (): Landmass => ({
  id: "land",
  type: "landmass",
  path: [
    [0, 200],
    [1000, 200],
    [1000, 1000],
    [0, 1000],
  ],
  holes: [],
  biome: "grassland",
});

const trunk = (points: Point[], width = 40): River => ({
  id: "trunk",
  type: "river",
  points,
  width,
  taper: false,
  z: 0,
});

describe("river snap", () => {
  it("finds a coast within reach and ignores one outside it", () => {
    const near = findSnap([500, 230], [500, 400], [coast()], [], 50);
    expect(near?.kind).toBe("coast");
    expect(near?.at).toEqual([500, 200]);
    expect(findSnap([500, 400], [500, 600], [coast()], [], 50)).toBeNull();
  });

  it("lays the tail across the coast, inland then seaward", () => {
    const { points, snap } = snapRiverEnd(
      [
        [500, 600],
        [500, 230],
      ],
      [coast()],
      [],
      50,
    );
    expect(snap?.kind).toBe("coast");
    // One clicked point became two: an approach inland, then the mouth out past the shore.
    expect(points).toHaveLength(3);
    expect(points[1]).toEqual([500, 200 + MOUTH_APPROACH]);
    expect(points[2]).toEqual([500, 200 - MOUTH_OVERSHOOT]);
  });

  /**
   * The whole reason the reshape is free: `riverCentreline` is an open Chaikin, which pins the
   * last point, so a tail on the coast normal leaves the final tangent on the normal too — and
   * the cap, being perpendicular to that tangent, comes out parallel to the shore.
   */
  it("leaves the centreline arriving perpendicular to the shore, even at 45°", () => {
    const { points } = snapRiverEnd(
      [
        [200, 700],
        [460, 240],
      ],
      [coast()],
      [],
      60,
    );
    const line = riverCentreline(points);
    const [ax, ay] = line[line.length - 2];
    const [bx, by] = line[line.length - 1];
    // The coast runs along x, so a perpendicular arrival has no x component left in it.
    expect(Math.abs(bx - ax)).toBeLessThan(1e-6);
    expect(by).toBeLessThan(ay); // and it is heading seaward
  });

  it("pushes the mouth past the coast, about one river-width", () => {
    const { points } = snapRiverEnd(
      [
        [500, 600],
        [500, 230],
      ],
      [coast()],
      [],
      50,
    );
    const seaward = 200 - points[points.length - 1][1];
    // Enough to cross the coast stroke and the band at the default gap; deliberately *not*
    // enough to clear a 60-unit one, which would put a needle three river-widths into the sea.
    expect(seaward).toBe(MOUTH_OVERSHOOT);
    expect(seaward).toBeGreaterThan(14); // the default ring gap
    expect(seaward).toBeLessThan(40);
  });

  it("takes the outward normal on a lake shore too, not just the outer ring", () => {
    const withLake: Landmass = {
      ...coast(),
      holes: [
        [
          [400, 400],
          [600, 400],
          [600, 600],
          [400, 600],
        ],
      ],
    };
    // A river running down the land into the lake's north shore.
    const { points } = snapRiverEnd(
      [
        [500, 250],
        [500, 380],
      ],
      [withLake],
      [],
      50,
    );
    // "Out of the land" here means *into the lake* — southward — not back up the continent.
    expect(points[points.length - 1][1]).toBeGreaterThan(400);
  });

  it("buries a tributary past the trunk's centreline by its half-width", () => {
    const flowing = trunk([
      [0, 500],
      [1000, 500],
    ]);
    const { points, snap } = snapRiverEnd(
      [
        [500, 300],
        [500, 470],
      ],
      [],
      [flowing],
      50,
    );
    expect(snap?.kind).toBe("river");
    // One point, not two — a confluence needs no reshaping, only to land inside the ribbon.
    expect(points).toHaveLength(2);
    expect(points[1][1]).toBeCloseTo(500 + 20, 6);
  });

  it("takes whichever target is nearer, with no preference for a type", () => {
    const shore = coast();
    const alongside = trunk([
      [0, 260],
      [1000, 260],
    ]);
    // 30 from the river, 45 from the coast.
    expect(findSnap([500, 245], [500, 100], [shore], [alongside], 80)?.kind).toBe("river");
    // 10 from the coast, 45 from the river.
    expect(findSnap([500, 210], [500, 100], [shore], [alongside], 80)?.kind).toBe("coast");
  });

  it("never snaps a river to itself", () => {
    const self = trunk([
      [0, 500],
      [1000, 500],
    ]);
    expect(findSnap([500, 480], [500, 300], [], [self], 50, "trunk")).toBeNull();
    expect(findSnap([500, 480], [500, 300], [], [self], 50)).not.toBeNull();
  });

  it("leaves a river that reached nothing exactly as drawn", () => {
    const drawn: Point[] = [
      [500, 600],
      [500, 700],
    ];
    const { points, snap } = snapRiverEnd(drawn, [coast()], [], 50);
    expect(snap).toBeNull();
    expect(points).toBe(drawn);
  });

  it("has nothing to snap with a single point", () => {
    expect(snapRiverEnd([[10, 10]], [coast()], [], 50).snap).toBeNull();
  });
});
