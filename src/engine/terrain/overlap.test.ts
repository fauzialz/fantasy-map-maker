import { describe, expect, it } from "vitest";
import { ringArea } from "../geometry/types";
import type { Landmass } from "../../scene/types";
import { resolveDrop, type ResolveDrop } from "./overlap";

/** A canvas big enough that nothing in these fixtures leaves it, unless a test says so. */
const CANVAS = { x: -5000, y: -5000, w: 10000, h: 10000 };
const drop = (input: Pick<ResolveDrop, "snapshot" | "others" | "gesture"> & Partial<ResolveDrop>) =>
  resolveDrop({ canvas: CANVAS, coastDetail: 0.5, policy: "apart", gap: 14, ...input });

/**
 * C1 — land never overlaps land at rest. These pin what a drop does about it, because the
 * moment resting overlap is allowed, `z`, draw order and a topmost hit rule all come back
 * (`08` §3).
 */
const box = (id: string, x: number, y: number, size = 100): Landmass => ({
  id,
  type: "landmass",
  path: [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
  ],
  holes: [],
  biome: "grassland",
});

describe("resolveDrop", () => {
  it("leaves a drop that touches nothing exactly where it was dropped", () => {
    const result = drop({
      snapshot: [box("a", 0, 0)],
      others: [box("b", 0, 0)],
      gesture: { kind: "move", delta: [500, 0] },
      policy: "apart",
    });
    expect(result.fraction).toBe(1);
    expect(result.landmasses).toHaveLength(2);
    expect(result.landmasses.find((l) => l.id === "a")!.path[0]).toEqual([500, 0]);
  });

  describe("keep apart", () => {
    it("slides back along the drag path until it fits", () => {
      // b sits at x=200. Dragging a from x=0 by 250 would bury it inside b.
      const result = drop({
        snapshot: [box("a", 0, 0)],
        others: [box("b", 200, 0)],
        gesture: { kind: "move", delta: [250, 0] },
        policy: "apart",
      });
      expect(result.fraction).toBeLessThan(1);
      expect(result.merged).toBe(false);
      // It should end just shy of touching: a's right edge at or before b's left edge.
      const a = result.landmasses.find((l) => l.id === "a")!;
      const right = Math.max(...a.path.map(([x]) => x));
      expect(right).toBeLessThanOrEqual(200);
      expect(right).toBeGreaterThan(180); // and it did travel most of the way
    });

    it("resolves to a position that genuinely does not overlap", () => {
      const result = drop({
        snapshot: [box("a", 0, 0)],
        others: [box("b", 120, 0)],
        gesture: { kind: "move", delta: [150, 30] },
        policy: "apart",
      });
      const a = result.landmasses.find((l) => l.id === "a")!;
      const again = drop({
        snapshot: [a],
        others: [box("b", 120, 0)],
        gesture: { kind: "move", delta: [0, 0] },
        policy: "apart",
      });
      // Feeding the resolved position back in must be a no-op: it already fits.
      expect(again.fraction).toBe(1);
    });

    it("keeps every landmass — sliding back changes a position, never an object", () => {
      const result = drop({
        snapshot: [box("a", 0, 0)],
        others: [box("b", 200, 0), box("c", 900, 900)],
        gesture: { kind: "move", delta: [250, 0] },
        policy: "apart",
      });
      expect(result.landmasses.map((l) => l.id).sort()).toEqual(["a", "b", "c"]);
    });

    it("preserves the dragged shape exactly — this is a translation, not a deformation", () => {
      const original = box("a", 0, 0);
      const result = drop({
        snapshot: [original],
        others: [box("b", 200, 0)],
        gesture: { kind: "move", delta: [250, 0] },
        policy: "apart",
      });
      const a = result.landmasses.find((l) => l.id === "a")!;
      expect(ringArea(a.path)).toBeCloseTo(ringArea(original.path), 6);
    });
  });

  describe("merge", () => {
    it("fuses overlapping land into one object", () => {
      const result = drop({
        snapshot: [box("a", 0, 0)],
        others: [box("b", 0, 0)],
        gesture: { kind: "move", delta: [50, 0] },
        policy: "merge",
      });
      expect(result.landmasses).toHaveLength(1);
      expect(result.merged).toBe(true);
    });

    it("gives the fused object the larger piece's id — ADR-10", () => {
      const result = drop({
        snapshot: [box("small", 0, 0, 60)],
        others: [box("big", 0, 0, 200)],
        gesture: { kind: "move", delta: [40, 0] },
        policy: "merge",
      });
      expect(result.landmasses).toHaveLength(1);
      expect(result.landmasses[0].id).toBe("big");
    });

    it("does not report a merge when nothing actually fused", () => {
      const result = drop({
        snapshot: [box("a", 0, 0)],
        others: [box("b", 0, 0)],
        gesture: { kind: "move", delta: [900, 0] },
        policy: "merge",
      });
      expect(result.merged).toBe(false);
      expect(result.landmasses).toHaveLength(2);
    });
  });
});

describe("rotation resolves too", () => {
  // C1 does not care which gesture broke it: turning a landmass can bury it in its
  // neighbour just as easily as sliding it, so the search walks the angle instead.
  const bar = (id: string, x: number, y: number, w: number, h: number): Landmass => ({
    id,
    type: "landmass",
    path: [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    holes: [],
    biome: "grassland",
  });

  it("walks the angle back to the last orientation that fit", () => {
    // A 300-long bar pinned at the origin, pointing along +x. Rotating 90° about the
    // origin maps (x,y) → (-y,x), so its far end swings to (0,300) — straight through b.
    const result = drop({
      snapshot: [bar("a", 0, -10, 300, 20)],
      others: [bar("b", -40, 240, 80, 80)],
      gesture: { kind: "rotate", origin: { x: 0, y: 0 }, degrees: 90 },
      policy: "apart",
    });
    expect(result.fraction).toBeLessThan(1);
    expect(result.fraction).toBeGreaterThan(0);
    const a = result.landmasses.find((l) => l.id === "a")!;
    const again = drop({
      snapshot: [a],
      others: [bar("b", -40, 240, 80, 80)],
      gesture: { kind: "rotate", origin: { x: 0, y: 0 }, degrees: 0 },
      policy: "apart",
    });
    expect(again.fraction).toBe(1);
  });

  it("leaves a rotation that hits nothing at full angle", () => {
    const result = drop({
      snapshot: [bar("a", 0, -10, 100, 20)],
      others: [bar("b", 900, 900, 50, 50)],
      gesture: { kind: "rotate", origin: { x: 0, y: 0 }, degrees: 90 },
      policy: "apart",
    });
    expect(result.fraction).toBe(1);
  });
});

/**
 * `08` §4 T2 asked for this and WP-15 did not deliver it: a landmass may hang off the edge
 * (the canvas is bounded and rings clip to it) but may not leave entirely, or a drag puts
 * it somewhere unreachable. Folded into the same search as overlap — "fits" means legal,
 * whatever made it illegal.
 */
describe("the canvas clamp", () => {
  const small = { x: 0, y: 0, w: 1000, h: 1000 };

  it("lets a landmass hang off the edge", () => {
    const result = drop({
      snapshot: [box("a", 400, 400)],
      others: [],
      gesture: { kind: "move", delta: [550, 0] },
      canvas: small,
    });
    expect(result.fraction).toBe(1);
    const a = result.landmasses[0];
    expect(Math.max(...a.path.map(([x]) => x))).toBeGreaterThan(small.w);
  });

  it("stops it leaving the canvas entirely", () => {
    const result = drop({
      snapshot: [box("a", 400, 400)],
      others: [],
      gesture: { kind: "move", delta: [5000, 0] },
      canvas: small,
    });
    expect(result.fraction).toBeLessThan(1);
    const a = result.landmasses[0];
    expect(Math.min(...a.path.map(([x]) => x))).toBeLessThan(small.w);
  });
});

describe("scale drops", () => {
  it("re-details the coast on drop, not during the drag", () => {
    const ring = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      ring.push([500 + Math.cos(t) * 100, 500 + Math.sin(t) * 100] as [number, number]);
    }
    const island: Landmass = {
      id: "a",
      type: "landmass",
      path: ring,
      holes: [],
      biome: "grassland",
    };
    const result = drop({
      snapshot: [island],
      others: [],
      gesture: { kind: "scale", origin: { x: 500, y: 500 }, factor: 4 },
    });
    expect(result.fraction).toBe(1);
    // Whether the count goes up or down depends on how detailed the input already was
    // for its size — that judgement belongs to `rescale.test.ts`, which measures density
    // against a freshly committed coast. What this asserts is narrower and is the thing
    // the drop is responsible for: the geometry is **not** merely the scaled input, so
    // re-detailing ran here rather than being left to the per-frame transform.
    const naive = ring.map(([x, y]) => [500 + (x - 500) * 4, 500 + (y - 500) * 4]);
    expect(result.landmasses[0].path).not.toEqual(naive);
    expect(result.landmasses[0].path.length).not.toBe(naive.length);
  });

  it("still keeps land apart when a scale-up would swallow a neighbour", () => {
    const result = drop({
      snapshot: [box("a", 400, 400, 100)],
      others: [box("b", 560, 400, 100)],
      gesture: { kind: "scale", origin: { x: 450, y: 450 }, factor: 4 },
    });
    expect(result.fraction).toBeLessThan(1);
    expect(result.landmasses).toHaveLength(2);
  });

  it("interpolates scale from 1, so t=0 means unchanged", () => {
    // A factor that instantly overlaps: the search must be able to reach "no change".
    const result = drop({
      snapshot: [box("a", 400, 400, 100)],
      others: [box("b", 501, 400, 100)],
      gesture: { kind: "scale", origin: { x: 450, y: 450 }, factor: 9 },
    });
    const a = result.landmasses.find((l) => l.id === "a")!;
    const width = Math.max(...a.path.map(([x]) => x)) - Math.min(...a.path.map(([x]) => x));
    expect(width).toBeGreaterThan(90);
    expect(width).toBeLessThan(140);
  });
});

/**
 * `08` §5's third outcome, and its two named hazards. The channel itself is the easy part;
 * what needs pinning is what happens when the carve would destroy or divide the thing
 * somebody just dragged.
 */
describe("carve a strait", () => {
  it("bites a channel instead of sliding back", () => {
    const result = drop({
      snapshot: [box("a", 0, 0, 400)],
      others: [box("b", 300, 0, 400)],
      gesture: { kind: "move", delta: [0, 0] },
      policy: "carve",
      gap: 20,
    });
    expect(result.fraction).toBe(1);
    expect(result.refused).toBeFalsy();
    const a = result.landmasses.find((l) => l.id === "a")!;
    // Its right edge has been eaten back clear of b's left edge, plus the gap.
    expect(Math.max(...a.path.map(([x]) => x))).toBeLessThan(300);
  });

  it("leaves a gap the ring engine can fill", () => {
    const gap = 30;
    const result = drop({
      snapshot: [box("a", 0, 0, 400)],
      others: [box("b", 300, 0, 400)],
      gesture: { kind: "move", delta: [0, 0] },
      policy: "carve",
      gap,
    });
    const a = result.landmasses.find((l) => l.id === "a")!;
    const channel = 300 - Math.max(...a.path.map(([x]) => x));
    // Roughening wiggles the edge, so the channel is not exactly `gap` — but it is open,
    // and it is the right order of magnitude.
    expect(channel).toBeGreaterThan(gap * 0.4);
    expect(channel).toBeLessThan(gap * 2);
  });

  it("refuses rather than annihilating what was just dragged", () => {
    // A small island dropped well inside a large landmass: carving would erase it.
    const result = drop({
      snapshot: [box("small", 400, 400, 60)],
      others: [box("big", 0, 0, 1200)],
      gesture: { kind: "move", delta: [300, 300] },
      policy: "carve",
      gap: 20,
    });
    expect(result.refused).toBe(true);
    expect(result.landmasses.map((l) => l.id).sort()).toEqual(["big", "small"]);
    expect(result.fraction).toBeLessThan(1);
  });

  it("reports how many pieces a carve left, so the toast can say so (ADR-10)", () => {
    // A bar dropped across a tall obstacle: the cut severs it into two.
    const bar: Landmass = {
      id: "bar",
      type: "landmass",
      path: [
        [0, 200],
        [600, 200],
        [600, 260],
        [0, 260],
      ],
      holes: [],
      biome: "grassland",
    };
    const wall: Landmass = {
      id: "wall",
      type: "landmass",
      path: [
        [280, 0],
        [340, 0],
        [340, 600],
        [280, 600],
      ],
      holes: [],
      biome: "grassland",
    };
    const result = drop({
      snapshot: [bar],
      others: [wall],
      gesture: { kind: "move", delta: [0, 0] },
      policy: "carve",
      gap: 10,
    });
    expect(result.refused).toBeFalsy();
    expect(result.pieces).toBe(2);
    // ADR-10: the larger piece keeps the id. Both halves are here plus the wall.
    expect(result.landmasses).toHaveLength(3);
    expect(result.landmasses.some((l) => l.id === "bar")).toBe(true);
  });

  it("never leaves land overlapping, whatever the roughener did (C1)", () => {
    const result = drop({
      snapshot: [box("a", 0, 0, 400)],
      others: [box("b", 300, 0, 400)],
      gesture: { kind: "move", delta: [0, 0] },
      policy: "carve",
      gap: 20,
    });
    const a = result.landmasses.filter((l) => l.id !== "b");
    const b = result.landmasses.filter((l) => l.id === "b");
    const again = drop({
      snapshot: a,
      others: b,
      gesture: { kind: "move", delta: [0, 0] },
      policy: "apart",
    });
    // Feeding the carved result back in as a zero-move must be a no-op: it already fits.
    expect(again.fraction).toBe(1);
  });
});
