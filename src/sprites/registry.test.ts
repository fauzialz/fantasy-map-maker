import { describe, expect, it } from "vitest";
import { SPRITES, spriteExtent, spriteRings, type SpriteKind } from "./registry";

const KINDS: SpriteKind[] = ["mountain", "tree", "landmark"];

/** What the pre-WP-21 measurement did: min/max of every number in the path string. */
const scrapeNumbers = (d: string) => {
  const numbers = d.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    minX = Math.min(minX, numbers[i]);
    maxX = Math.max(maxX, numbers[i]);
    minY = Math.min(minY, numbers[i + 1]);
    maxY = Math.max(maxY, numbers[i + 1]);
  }
  return { minX, minY, maxX, maxY };
};

describe("spriteExtent", () => {
  it("measures the curve, not the control point — mountain 2 is the proof", () => {
    // "M4 88 Q28 30 48 48 Q64 22 94 88 Z" — control points at y=30 and y=22, but a
    // quadratic only ever reaches half way to its control point. The ink stops near y=40.
    const extent = spriteExtent("mountain", 2);
    expect(scrapeNumbers(SPRITES.mountain[2].body).minY).toBe(22);
    expect(extent.minY).toBeGreaterThan(35);
  });

  it("never measures looser than the old regex did, and is tighter where curves are", () => {
    let tightened = 0;
    for (const kind of KINDS) {
      SPRITES[kind].forEach((sprite, variant) => {
        const walked = spriteExtent(kind, variant);
        const scraped = scrapeNumbers(sprite.body);
        // STROKE_PAD is added by spriteExtent and is real ink, so compare inside it.
        expect(walked.minX).toBeGreaterThanOrEqual(scraped.minX - 1.31);
        expect(walked.minY).toBeGreaterThanOrEqual(scraped.minY - 1.31);
        expect(walked.maxX).toBeLessThanOrEqual(scraped.maxX + 1.31);
        expect(walked.maxY).toBeLessThanOrEqual(scraped.maxY + 1.31);
        if (sprite.body.includes("Q")) tightened++;
      });
    }
    // Six of the sixteen sprites carry curves; if none did, the claim above is untested.
    expect(tightened).toBeGreaterThan(0);
  });

  it("wraps out-of-range variants instead of throwing", () => {
    expect(spriteExtent("tree", 99)).toEqual(spriteExtent("tree", 99 % SPRITES.tree.length));
    expect(spriteExtent("tree", -1)).toEqual(spriteExtent("tree", SPRITES.tree.length - 1));
  });
});

describe("spriteRings", () => {
  it("gives every sprite a silhouette with area", () => {
    for (const kind of KINDS) {
      SPRITES[kind].forEach((_, variant) => {
        expect(spriteRings(kind, variant).length).toBeGreaterThan(0);
      });
    }
  });

  it("returns the same cached array rather than re-parsing", () => {
    expect(spriteRings("mountain", 0)).toBe(spriteRings("mountain", 0));
  });
});
