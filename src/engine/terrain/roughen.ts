import { createNoise2D } from "simplex-noise";
import { toIntRing } from "../geometry/coords";
import type { MultiPolygon, Point, Ring } from "../geometry/types";
import { simplify } from "./smooth";

/**
 * WP-17 — making a carved channel read as coastline instead of machining.
 *
 * `differenceLand(dropped, offsetGrow(other, gap))` produces a perfect parallel channel
 * tracing the other landmass's coast at a constant distance. It is the right *shape* and
 * exactly the wrong *texture*: nothing on a hand-drawn map runs parallel to anything at a
 * fixed offset. `08` §5 calls re-roughening the single largest piece of that package, and
 * this is it.
 *
 * The whole trick is knowing **which points are new**. Everything else follows.
 */

/**
 * Points on the cut are the ones that were not there before.
 *
 * Cheaper and more exact than measuring distance to the grown polygon: the boolean op
 * copies surviving vertices through verbatim, and both sides pass through the same
 * `SCALE` rounding, so an untouched point matches its original bit for bit. Distance
 * testing would be O(points × otherPoints) and would still need a tolerance to guess with.
 */
const keyOf = ([x, y]: Point): string => `${x},${y}`;
const keySet = (rings: Ring[]): Set<string> => {
  const keys = new Set<string>();
  for (const ring of rings) for (const point of toIntRing(ring)) keys.add(keyOf(point));
  return keys;
};

/**
 * Deterministic per landmass, so the same drop always carves the same coast.
 *
 * Returns a **phase** alongside the noise, and that is not cosmetic: simplex noise is
 * exactly zero at every lattice point, so sampling a run from `travelled = 0` would hand
 * every cut an accidental flat spot at its start. It also decorrelates one landmass's
 * coast from another's.
 */
function seededNoise(seed: string) {
  let state = 0;
  for (let i = 0; i < seed.length; i++) state = (Math.imul(state, 31) + seed.charCodeAt(i)) | 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const phase = random() * 1000;
  return { noise: createNoise2D(random), phase };
}

/** Runs of consecutive new points, wrapping the ring. */
function cutRuns(isNew: boolean[]): [number, number][] {
  const n = isNew.length;
  if (isNew.every(Boolean)) return [[0, n]];
  const runs: [number, number][] = [];
  // Start from a point that is *not* new, so no run is split across the wrap.
  const start = isNew.indexOf(false);
  if (start === -1) return runs;
  let i = 0;
  while (i < n) {
    const at = (start + i) % n;
    if (!isNew[at]) {
      i++;
      continue;
    }
    let length = 0;
    while (length < n && isNew[(start + i + length) % n]) length++;
    runs.push([(start + i) % n, length]);
    i += length;
  }
  return runs;
}

interface Options {
  /** how far a cut point may wander, in map units — keep well under the channel width */
  amplitude: number;
  /** distance between wiggles, in map units */
  wavelength: number;
  coastDetail: number;
  seed: string;
}

function roughenRing(ring: Ring, untouched: Set<string>, options: Options): Ring {
  const n = ring.length;
  if (n < 4) return ring;

  const rounded = toIntRing(ring);
  const isNew = rounded.map((point) => !untouched.has(keyOf(point)));
  const runs = cutRuns(isNew);
  if (runs.length === 0) return ring;

  const { noise, phase } = seededNoise(options.seed);
  const out: Ring = ring.map(([x, y]) => [x, y]);

  for (const [start, length] of runs) {
    // Arc length along the run, so the wiggle has a consistent scale in map units rather
    // than in vertices — the cut's point spacing is not uniform.
    let travelled = 0;
    for (let step = 0; step < length; step++) {
      const i = (start + step) % n;
      const prev = ring[(i - 1 + n) % n];
      const next = ring[(i + 1) % n];
      if (step > 0) {
        const back = ring[(i - 1 + n) % n];
        travelled += Math.hypot(ring[i][0] - back[0], ring[i][1] - back[1]);
      }

      const tx = next[0] - prev[0];
      const ty = next[1] - prev[1];
      const len = Math.hypot(tx, ty) || 1;
      // Outward normal of the local tangent.
      const nx = -ty / len;
      const ny = tx / len;

      /**
       * Taper to zero at both ends of the run. Without it the displacement steps off a
       * cliff where the cut meets the coast that was already there, and the join reads as
       * a defect rather than as a shoreline.
       */
      const u = length > 1 ? step / (length - 1) : 0.5;
      const taper = length === n ? 1 : Math.sin(Math.PI * u);
      const push = noise(phase + travelled / options.wavelength, 0) * options.amplitude * taper;

      out[i] = [ring[i][0] + nx * push, ring[i][1] + ny * push];
    }
  }

  // The displacement adds detail the map's own setting may not want to keep.
  return simplify(out, options.coastDetail);
}

/**
 * Roughen every ring of `carved` wherever it departs from `before`.
 *
 * @param before the geometry as it was prior to the boolean — the reference for "new"
 */
export function roughenCut(
  carved: MultiPolygon,
  before: MultiPolygon,
  options: Options,
): MultiPolygon {
  const untouched = keySet(before.flat());
  return carved.map((polygon) =>
    polygon.map((ring, index) =>
      roughenRing(ring, untouched, { ...options, seed: `${options.seed}:${index}` }),
    ),
  );
}
