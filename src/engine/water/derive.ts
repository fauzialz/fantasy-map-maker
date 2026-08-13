import type { Landmass, Water } from "../../scene/types";
import type { MultiPolygon, Rect } from "../geometry/types";
import { clipRings, landUnion, ringBands, waterRegion } from "../rings/rings";
import { cutLand, cutUnion, waterUnion, type CutLandmass } from "./cut";

/**
 * WP-40 — the whole derived picture, in one pass: the drawn land, and the coastal bands.
 *
 * **Replaces the `deriveRings` op** (Pipeline C, `04-geometry-pipeline.md` §"Worker message
 * protocol"), which produced bands alone. It is one op rather than two because both halves
 * need `union(water)` and the cut boundary, and computing those twice for one user action is
 * the expensive part done twice — the ops here are deliberately coarse for exactly this
 * reason.
 *
 * ponytail: **C2's measurement, and the gate WP-40 had to clear.** C2 warned that this now
 * unions two collections instead of one, so the question was whether the second collection
 * changes the order of magnitude. It does not: **water costs 0–10% on top of the ring
 * derivation, which is inside the run-to-run spread on the worst case.**
 *
 * Measured on a generated 4000×3000 world, ringCount 4, ringGap 14, median of 5 after a warm
 * run, in Node (vitest) on the dev VPS — *not* the machine `engine/rings/rings.ts` recorded
 * its 119–488 ms on, which is why the ratio is the transferable number and the absolutes are
 * not:
 *
 * | world | landmasses / coastline points | no water | 1 river | 3 rivers + 1 lake |
 * |---|---|---|---|---|
 * | single | 5 / 721 | 231 ms | 230 ms | 253 ms (+10%) |
 * | multiple | 2 / 1 171 | 380 ms | 398 ms | 418 ms (+10%) |
 * | archipelago | 13 / 2 931 | 1 544 ms | 1 515 ms | 1 468 ms (−5%, inside noise) |
 *
 * The reason is structural rather than lucky, which is what makes it likely to hold: the cost
 * is four Clipper offsets over the whole coastline (`ringBands`), and one water union plus one
 * difference is small beside them. So the ceiling that matters is still `ringCount`, exactly
 * as `rings.ts` records — water did not move it.
 *
 * Re-measure this if the cut ever stops being a single difference — per-object subtraction,
 * or provenance tracking, would both change the shape of the cost rather than its constant.
 */

export interface DeriveTerrain {
  landmasses: Landmass[];
  waters: Water[];
  canvas: Rect;
  ringCount: number;
  ringGap: number;
  /** `settings.coastalRings` — off skips the band work entirely, as it always has. */
  rings: boolean;
}

export interface DerivedTerrain {
  /**
   * The drawn land, one entry per landmass — or **null when there is no water**, which
   * tells the renderer to draw the landmass objects directly.
   *
   * Null rather than a copy of the input on purpose. A water-free map is every map that
   * exists the moment WP-40's migration runs, and the fast path means such a map pays not
   * one boolean op more than it did before this package: the derivation is asynchronous, so
   * a `land` that had to be waited for would put a frame of empty terrain in front of every
   * user who has never drawn a river.
   */
  land: CutLandmass[] | null;
  bands: MultiPolygon[];
}

export function deriveTerrain({
  landmasses,
  waters,
  canvas,
  ringCount,
  ringGap,
  rings,
}: DeriveTerrain): DerivedTerrain {
  const land = landUnion(landmasses);
  const water = waterUnion(waters);
  /** The coastline as drawn — banks included, estuaries opened. */
  const cut = cutUnion(land, water);

  return {
    land: water.length === 0 ? null : cutLand(landmasses, water),
    /**
     * **D5, and the reason this is two operations rather than one.** Bands offset from the
     * *cut* boundary, so they follow a river's banks outward — then intersect the **pre-cut**
     * sea, `canvas − union(land)`, which is the only thing that keeps them out of the channel
     * the river just opened. A band inside a channel is wider than the channel at any
     * sensible `ringGap` (C4), so it would fill it solid.
     *
     * There is **no provenance tracking** here, and that is the design rather than a
     * shortcut: neither `polygon-clipping` nor `clipper-lib` can say which output edge came
     * from which input, and re-associating vertices by proximity is the kind of fragile that
     * shows up on one map in fifty.
     */
    bands:
      !rings || cut.length === 0
        ? []
        : clipRings(ringBands(cut, ringCount, ringGap), waterRegion(canvas, land)),
  };
}
