import { describe, expect, it } from "vitest";
import type { Landmass, Ring, Water } from "../../scene/types";
import { pointInMultiPolygon } from "../geometry/nesting";
import { multiPolygonArea, type MultiPolygon, type Point, type Rect } from "../geometry/types";
import { cutLand, waterUnion } from "./cut";
import { deriveTerrain } from "./derive";

/**
 * WP-40 fixtures (`16` §5) — the geometry, before any tool exists to make it.
 *
 * The package carries every geometric risk in Batch 14 and ships no way to draw a river, so
 * these are the only things that can say whether the model works. They are written against
 * the derivation rather than the render for the reason `02` §7 gives about anything derived:
 * asserting on a picture proves the renderer, and the renderer is not what is new here.
 */

const CANVAS: Rect = { x: 0, y: 0, w: 800, h: 600 };

const rect = (x0: number, y0: number, x1: number, y1: number): Ring => [
  [x0, y0],
  [x1, y0],
  [x1, y1],
  [x0, y1],
];

/** A square continent, well clear of the canvas edge. */
const continent = (holes: Ring[] = []): Landmass => ({
  id: "c",
  type: "landmass",
  path: rect(200, 100, 600, 500),
  holes,
  biome: "grassland",
});

const water = (id: string, path: Ring, holes: Ring[] = []): Water => ({
  id,
  type: "water",
  path,
  holes,
});

/**
 * A river 40 units wide running west→east across the whole continent, out to open sea at
 * both ends. It **severs** the landmass, which is the case with the most ways to go wrong.
 */
const river = () => water("r", rect(100, 280, 700, 320));

const derive = (landmasses: Landmass[], waters: Water[], ringGap = 14, ringCount = 4) =>
  deriveTerrain({ landmasses, waters, canvas: CANVAS, ringCount, ringGap, rings: true });

const inLand = (land: { shape: MultiPolygon }[], point: Point) =>
  land.some((piece) => pointInMultiPolygon(piece.shape, point));

const inAnyBand = (bands: MultiPolygon[], point: Point) =>
  bands.some((band) => pointInMultiPolygon(band, point));

describe("a river crossing a coast", () => {
  /**
   * The headline: `15` §1.1's defect stops being **representable**.
   *
   * A river used to be an independent ribbon laid over the land, so the coastline ran on
   * underneath it and the coast stroke crossed the mouth. Here the land simply is not there —
   * one boundary, which the stroke follows around the estuary and up the banks, because they
   * are the same line.
   */
  it("produces one merged boundary rather than two that cross", () => {
    const [cut] = cutLand([continent()], waterUnion([river()]));

    // Severed: the continent is one object, drawn as two pieces.
    expect(cut.shape).toHaveLength(2);
    expect(cut.id).toBe("c");

    // Nothing is drawn in the channel, at the middle and at both former coastlines.
    for (const point of [
      [400, 300],
      [200, 300],
      [600, 300],
    ] as Point[]) {
      expect(inLand([cut], point)).toBe(false);
    }
    // The land either side of it is untouched.
    expect(inLand([cut], [400, 200])).toBe(true);
    expect(inLand([cut], [400, 400])).toBe(true);
  });

  it("takes exactly the river's area out of the land, and no more", () => {
    const land = continent();
    const [cut] = cutLand([land], waterUnion([river()]));
    // The river is 40 tall and crosses the full 400 width of the continent.
    const expected = 400 * 400 - 400 * 40;
    expect(multiPolygonArea(cut.shape)).toBeCloseTo(expected, 6);
  });

  /** Non-destructive (D1, ADR-47): the stencil never touches what is underneath it. */
  it("leaves the landmass object itself untouched", () => {
    const land = continent();
    const before = JSON.stringify(land);
    cutLand([land], waterUnion([river()]));
    expect(JSON.stringify(land)).toBe(before);
  });
});

describe("bands and the channel (D5)", () => {
  /**
   * **The fixture D5 exists for.** Bands grow from the *cut* boundary — so they follow the
   * banks — but are clipped to the **pre-cut** sea, so they cannot enter the channel the
   * river just opened. Get the second half wrong and a single band at any sensible `ringGap`
   * is wider than the river (C4), so it fills the channel solid and the river disappears
   * under its own coastal rings.
   *
   * Both ends of the settings range, because the failure is gap-dependent — and **the two ends
   * are not equally sharp**. Clipping the bands to the *post-cut* sea instead of the pre-cut one
   * (the exact way to get D5 wrong) fails the 60 case and *passes* the 4 case, because at gap 4
   * the band is too narrow to reach the sampled points inside a 40-wide channel. The 60 case is
   * the one with teeth; the 4 case is here to say the rule is not gap-specific.
   */
  it.each([4, 60])("puts no band inside a channel at ringGap %i", (ringGap) => {
    const { bands } = derive([continent()], [river()], ringGap);

    for (const point of [
      [300, 300],
      [400, 300],
      [500, 300],
    ] as Point[]) {
      expect(inAnyBand(bands, point)).toBe(false);
    }
  });

  /**
   * Stated the other way round, which is how `16` §5 words it: inside the channel, the band
   * set derived **with** the river is identical to the one derived without it. Nothing the
   * river does may reach in there.
   */
  it("derives the same bands inside the channel as if the river were not there", () => {
    const withRiver = derive([continent()], [river()]).bands;
    const without = derive([continent()], []).bands;

    expect(withRiver).toHaveLength(without.length);
    for (let x = 220; x <= 580; x += 20) {
      for (const y of [290, 300, 310]) {
        const point: Point = [x, y];
        expect(withRiver.map((band) => pointInMultiPolygon(band, point))).toEqual(
          without.map((band) => pointInMultiPolygon(band, point)),
        );
      }
    }
  });

  /** And the bands still exist where they always did — this must not pass by deriving none. */
  it("still bands the open sea off the west coast", () => {
    const { bands } = derive([continent()], [river()]);
    expect(bands).toHaveLength(4);
    expect(inAnyBand(bands, [195, 200])).toBe(true);
  });
});

describe("water wholly inside the land", () => {
  const lake = () => water("l", rect(300, 150, 380, 230));

  it("cuts a hole in the drawn land", () => {
    const { land } = derive([continent()], [lake()]);
    expect(land).not.toBeNull();
    const [cut] = land!;

    // One outer ring plus one hole — a lake, not a severed piece.
    expect(cut.shape).toHaveLength(1);
    expect(cut.shape[0]).toHaveLength(2);
    expect(inLand([cut], [340, 190])).toBe(false);
    expect(inLand([cut], [250, 190])).toBe(true);
  });

  /**
   * **No band inside it**, and that is D5 rather than an accident: the lake is inside
   * `union(land)`, so the pre-cut sea the bands are clipped to excludes it entirely.
   *
   * Note this is the *painted* lake — D6 says a lake carved with the land brush does get
   * bands, because the land is genuinely absent there. Both behaviours come from the same
   * rule; only the geometry differs.
   */
  it("puts no band in it", () => {
    const { bands } = derive([continent()], [lake()]);
    expect(inAnyBand(bands, [340, 190])).toBe(false);
  });
});

describe("water wholly at sea (D16)", () => {
  const offshore = () => water("o", rect(40, 40, 140, 140));

  it("changes nothing about the land", () => {
    const plain = cutLand([continent()], []);
    const { land } = derive([continent()], [offshore()]);
    expect(multiPolygonArea(land![0].shape)).toBeCloseTo(multiPolygonArea(plain[0].shape), 6);
    expect(land![0].shape).toHaveLength(1);
  });

  it("changes nothing about the bands", () => {
    const withWater = derive([continent()], [offshore()]).bands;
    const without = derive([continent()], []).bands;

    expect(withWater).toHaveLength(without.length);
    // Sample the sea it sits in as well as the coast, so "identical" is not just "empty".
    for (const point of [
      [90, 90],
      [195, 300],
      [605, 300],
      [400, 95],
    ] as Point[]) {
      expect(withWater.map((band) => pointInMultiPolygon(band, point))).toEqual(
        without.map((band) => pointInMultiPolygon(band, point)),
      );
    }
  });

  /**
   * It renders nothing at all, which is D16 and is **correct rather than tolerated**: at an
   * estuary this is exactly the behaviour wanted, since the water there is already sea. The
   * honest live preview WP-43 owes is what stops a user committing to an invisible object.
   */
  it("is invisible — the water layer draws nothing of its own", () => {
    const { land } = derive([continent()], [offshore()]);
    expect(inLand(land!, [90, 90])).toBe(false);
  });
});

describe("the substances meeting where one is already absent", () => {
  /**
   * `16` §5 asks for this to be asserted rather than discovered: the sea brush carving where
   * water already sits removes land that is not there, so it must be a **no-op on the
   * picture**. A bay bitten out of the coast, with a water body sitting in the same bay.
   */
  it("is a no-op when water covers a bay the sea brush already carved", () => {
    const bay = rect(200, 200, 300, 300);
    const carved: Landmass = {
      ...continent(),
      path: [
        [300, 100],
        [600, 100],
        [600, 500],
        [200, 500],
        [200, 300],
        [300, 300],
        [300, 200],
        [200, 200],
        [200, 100],
      ],
    };

    const plain = cutLand([carved], []);
    const overlaid = cutLand([carved], waterUnion([water("b", bay)]));
    expect(multiPolygonArea(overlaid[0].shape)).toBeCloseTo(multiPolygonArea(plain[0].shape), 6);
  });
});

describe("the fast path", () => {
  /**
   * `land` is **null** with no water, and that is load-bearing rather than tidy: it is what
   * lets a water-free map — every map in existence the moment this shipped — draw straight
   * from the scene without waiting for a derivation.
   */
  it("derives no land at all when there is no water", () => {
    expect(derive([continent()], []).land).toBeNull();
  });

  it("derives land the moment any water exists, even offshore", () => {
    expect(derive([continent()], [water("o", rect(40, 40, 60, 60))]).land).not.toBeNull();
  });

  /** Two overlapping bodies subtract as one shape, or the seam between them strokes a bank. */
  it("unions overlapping water before subtracting it", () => {
    const merged = waterUnion([
      water("a", rect(250, 250, 450, 350)),
      water("b", rect(350, 250, 550, 350)),
    ]);
    expect(merged).toHaveLength(1);
    expect(multiPolygonArea(merged)).toBeCloseTo(300 * 100, 6);
  });
});
