import { describe, expect, it } from "vitest";
import { pathRings } from "./path";
import { SPRITES } from "./registry";

const maxOf = (rings: [number, number][][], axis: 0 | 1) =>
  Math.max(...rings.flat().map((point) => point[axis]));

describe("pathRings", () => {
  it("walks absolute M/L/Z into one ring", () => {
    expect(pathRings("M4 88 L38 14 L72 88 Z")).toEqual([
      [
        [4, 88],
        [38, 14],
        [72, 88],
      ],
    ]);
  });

  it("splits subpaths into separate rings", () => {
    // A tree: trunk, then foliage.
    const rings = pathRings("M46 88 L46 66 L54 66 L54 88 Z M20 60 L50 10 L80 60 Z");
    expect(rings).toHaveLength(2);
    expect(rings[0]).toHaveLength(4);
    expect(rings[1]).toHaveLength(3);
  });

  it("closes a final ring that never says Z", () => {
    expect(pathRings("M0 0 L10 0 L10 10")).toHaveLength(1);
  });

  it("drops rings too small to have area, so an open detail stroke is harmless", () => {
    expect(pathRings("M38 20 L38 88 M38 30 L18 70")).toEqual([]);
  });

  it("treats repeated coordinate pairs as more of the same command", () => {
    expect(pathRings("M0 0 L10 0 20 10 30 0 Z")[0]).toHaveLength(4);
    // Pairs after an M are lineTos, per SVG — not three separate subpaths.
    expect(pathRings("M0 0 10 0 10 10 Z")).toHaveLength(1);
  });

  describe("flattening a quadratic", () => {
    // Control point at y=100, but a quadratic only ever reaches half way to it.
    const rings = pathRings("M0 0 Q50 100 100 0 Z");

    it("samples the curve instead of jumping to the endpoint", () => {
      expect(rings[0].length).toBeGreaterThan(8);
    });

    it("never reaches the control point — this is the whole box-tightening claim", () => {
      expect(maxOf(rings, 1)).toBeCloseTo(50, 1);
      expect(maxOf(rings, 1)).toBeLessThan(51);
    });

    it("still reaches the endpoint exactly", () => {
      expect(rings[0].at(-1)).toEqual([100, 0]);
    });
  });

  describe("the guard", () => {
    it.each([
      ["relative lineto", "M0 0 l10 10 Z"],
      ["relative moveto", "m0 0 L10 10 Z"],
      ["arc", "M0 0 A5 5 0 0 1 10 10 Z"],
      ["horizontal shorthand", "M0 0 H50 V50 Z"],
      ["cubic", "M0 0 C10 10 20 20 30 0 Z"],
      ["smooth quadratic", "M0 0 Q10 10 20 0 T40 0 Z"],
    ])("rejects %s rather than mis-measuring it", (_label, d) => {
      expect(() => pathRings(d)).toThrow(/unsupported command/);
    });

    it("rejects a path that ends mid-command", () => {
      expect(() => pathRings("M0 0 L10")).toThrow(/mid-command/);
    });

    it("rejects a number where a command belongs", () => {
      expect(() => pathRings("4 88 L38 14")).toThrow(/command was expected/);
    });
  });

  /**
   * The reason the guard exists (ADR-30 F5): it has to run over the real artwork, so that
   * swapping a sprite for one a design tool exported fails *here* rather than showing up
   * later as selection feeling slightly off.
   */
  it("accepts every path in the registry, body detail and highlight alike", () => {
    for (const [kind, sprites] of Object.entries(SPRITES)) {
      sprites.forEach((sprite, variant) => {
        for (const field of ["body", "detail", "highlight"] as const) {
          const d = sprite[field];
          if (!d) continue;
          expect(() => pathRings(d), `${kind}:${variant} ${field}`).not.toThrow();
        }
      });
    }
  });

  it("gives every sprite body at least one ring with area", () => {
    for (const sprites of Object.values(SPRITES)) {
      for (const sprite of sprites) expect(pathRings(sprite.body).length).toBeGreaterThan(0);
    }
  });
});
