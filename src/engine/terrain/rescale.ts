import type { Landmass, Ring } from "../../scene/types";
import { chaikin, simplify } from "./smooth";

/**
 * WP-16 — putting a scaled coastline back at the map's own level of detail.
 *
 * **Why scale is the destructive transform (C3).** `epsilonFor(coastDetail)` is a
 * tolerance in **map units**: a coast committed at ε is allowed to deviate from the raster
 * it came from by ε. Scale the geometry by 4 and that deviation scales too — the shape is
 * now 4× bigger and 4× coarser than a coast painted at that size, with the straight
 * segments between its points four times longer and plainly visible as straight.
 *
 * **Re-simplifying alone only fixes one direction.** Scaling *down* leaves points closer
 * together than ε, and Douglas–Peucker sheds them — that half is exactly what `08` §4 T3
 * describes. Scaling *up* is the opposite problem: the points are already further apart
 * than ε, so simplification has nothing to remove, and no amount of it invents detail that
 * was never recorded.
 *
 * So scaling up **resamples**. Chaikin is what the pipeline already uses to turn a jagged
 * traced contour into a coastline (S3), and it does the right thing here for the same
 * reason: it subdivides, and it rounds precisely the long straight runs that scaling made
 * visible. Simplify then trims whatever the new size still cannot show, which is what
 * stops the point count growing without bound across repeated scale cycles.
 *
 * This is lossy, and knowingly so — it is why scale is its own tier rather than riding
 * along with move and rotate. Rounding a corner is not the same as remembering what was
 * there, and scaling up then down does not return the original coastline.
 */

/**
 * Chaikin doubles the point count per pass, so matching a growth factor takes log2 of it.
 * Capped at 3: beyond 8× the shape is guesswork either way, and each pass costs points
 * that simplification then has to walk back.
 */
const passesFor = (factor: number): number =>
  factor <= 1 ? 0 : Math.min(3, Math.max(0, Math.round(Math.log2(factor))));

const rescaleRing = (ring: Ring, passes: number, coastDetail: number): Ring =>
  simplify(passes > 0 ? chaikin(ring, passes) : ring, coastDetail);

/** Re-detail a scaled landmass, lakes included — a lake is a coastline too. */
export function rescaleCoast(landmass: Landmass, factor: number, coastDetail: number): Landmass {
  const passes = passesFor(factor);
  return {
    ...landmass,
    path: rescaleRing(landmass.path, passes, coastDetail),
    holes: landmass.holes
      .map((hole) => rescaleRing(hole, passes, coastDetail))
      // A lake that no longer has three points at this size is not a lake any more.
      .filter((hole) => hole.length >= 3),
  };
}
