import { describe, expect, it } from "vitest";
import { ringArea } from "../geometry/types";
import { resolveDrop } from "./overlap";
import type { Landmass } from "../../scene/types";

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
    const result = resolveDrop({
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
      const result = resolveDrop({
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
      const result = resolveDrop({
        snapshot: [box("a", 0, 0)],
        others: [box("b", 120, 0)],
        gesture: { kind: "move", delta: [150, 30] },
        policy: "apart",
      });
      const a = result.landmasses.find((l) => l.id === "a")!;
      const again = resolveDrop({
        snapshot: [a],
        others: [box("b", 120, 0)],
        gesture: { kind: "move", delta: [0, 0] },
        policy: "apart",
      });
      // Feeding the resolved position back in must be a no-op: it already fits.
      expect(again.fraction).toBe(1);
    });

    it("keeps every landmass — sliding back changes a position, never an object", () => {
      const result = resolveDrop({
        snapshot: [box("a", 0, 0)],
        others: [box("b", 200, 0), box("c", 900, 900)],
        gesture: { kind: "move", delta: [250, 0] },
        policy: "apart",
      });
      expect(result.landmasses.map((l) => l.id).sort()).toEqual(["a", "b", "c"]);
    });

    it("preserves the dragged shape exactly — this is a translation, not a deformation", () => {
      const original = box("a", 0, 0);
      const result = resolveDrop({
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
      const result = resolveDrop({
        snapshot: [box("a", 0, 0)],
        others: [box("b", 0, 0)],
        gesture: { kind: "move", delta: [50, 0] },
        policy: "merge",
      });
      expect(result.landmasses).toHaveLength(1);
      expect(result.merged).toBe(true);
    });

    it("gives the fused object the larger piece's id — ADR-10", () => {
      const result = resolveDrop({
        snapshot: [box("small", 0, 0, 60)],
        others: [box("big", 0, 0, 200)],
        gesture: { kind: "move", delta: [40, 0] },
        policy: "merge",
      });
      expect(result.landmasses).toHaveLength(1);
      expect(result.landmasses[0].id).toBe("big");
    });

    it("does not report a merge when nothing actually fused", () => {
      const result = resolveDrop({
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
    const result = resolveDrop({
      snapshot: [bar("a", 0, -10, 300, 20)],
      others: [bar("b", -40, 240, 80, 80)],
      gesture: { kind: "rotate", origin: { x: 0, y: 0 }, degrees: 90 },
      policy: "apart",
    });
    expect(result.fraction).toBeLessThan(1);
    expect(result.fraction).toBeGreaterThan(0);
    const a = result.landmasses.find((l) => l.id === "a")!;
    const again = resolveDrop({
      snapshot: [a],
      others: [bar("b", -40, 240, 80, 80)],
      gesture: { kind: "rotate", origin: { x: 0, y: 0 }, degrees: 0 },
      policy: "apart",
    });
    expect(again.fraction).toBe(1);
  });

  it("leaves a rotation that hits nothing at full angle", () => {
    const result = resolveDrop({
      snapshot: [bar("a", 0, -10, 100, 20)],
      others: [bar("b", 900, 900, 50, 50)],
      gesture: { kind: "rotate", origin: { x: 0, y: 0 }, degrees: 90 },
      policy: "apart",
    });
    expect(result.fraction).toBe(1);
  });
});
