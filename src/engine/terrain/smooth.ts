import simplifyJs from "simplify-js";
import type { Point, Ring } from "../geometry/types";

/**
 * S3 — Chaikin corner cutting. Each iteration replaces every vertex with two points a
 * quarter and three quarters along its outgoing edge, so the point count doubles and hard
 * corners round off.
 *
 * @param closed a coastline wraps, so every vertex is cut. An **open** polyline (a river
 * centreline) instead pins its endpoints, or the spline would creep away from the first
 * and last points the user clicked.
 */
export function chaikin(ring: Ring, iterations = 2, closed = true): Ring {
  let current = ring;
  for (let pass = 0; pass < iterations; pass++) {
    if (current.length < 3) return current;
    const n = current.length;
    const next: Ring = closed ? [] : [current[0]];
    for (let i = 0, edges = closed ? n : n - 1; i < edges; i++) {
      const [x1, y1] = current[i];
      const [x2, y2] = current[(i + 1) % n];
      next.push([x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25]);
      next.push([x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75]);
    }
    if (!closed) next.push(current[n - 1]);
    current = next;
  }
  return current;
}

export const EPSILON_SMOOTH = 8;

/**
 * The finest Douglas–Peucker tolerance the app will use, and it is **the mask cell** (WP-46).
 *
 * It was 0.5, which is a quarter of a mask pixel — so at `coastDetail` 1.00 the simplifier was
 * asked to preserve detail finer than the raster the outline had just been traced from, and it
 * dutifully kept the **quantisation staircase**. Measured: one water stroke stored **1021
 * points** at 0.5 against 7 at the default setting, and a 40-wide stroke 637 against 11.
 *
 * At 2.0 those become 7 and 12, and the outline moves by **at most 1.9 map units** — a
 * twentieth of a percent of a 4000-unit canvas. A real coastline degrades gracefully across the
 * same range instead of falling off a cliff (815 → 158 points), which is precisely the
 * difference between detail that is in the shape and detail that is in the sampling.
 *
 * `MASK_RESOLUTION` is the number this is pinned to. If the mask ever gets finer, this follows.
 */
export const EPSILON_DETAILED = 2;

/**
 * Douglas–Peucker tolerance for a coastDetail setting.
 *
 * The pipeline spec writes `lerp(0.5, 8, coastDetail)`, which would make coastDetail 1
 * the *smoothest* setting. That contradicts the scene data model, where coastDetail is
 * "0 = very smooth/stylized, 1 = rough/natural". The data model is the contract, so the
 * lerp runs the other way: same 0.5..8 range, detail rising with the slider.
 */
export const epsilonFor = (coastDetail: number): number =>
  EPSILON_SMOOTH + (EPSILON_DETAILED - EPSILON_SMOOTH) * Math.min(Math.max(coastDetail, 0), 1);

/** S4 — Douglas–Peucker simplification in map-space, driven by the coast-detail slider. */
export const simplify = (ring: Ring, coastDetail: number): Ring =>
  simplifyTo(ring, epsilonFor(coastDetail));

/**
 * The same thing at an explicit tolerance, for geometry that has no `coastDetail`.
 *
 * A spline ribbon is the only such geometry today (WP-45): it is generated rather than traced,
 * so the right tolerance comes from the wander its own roughness setting put there, not from a
 * slider about coastlines.
 */
export function simplifyTo(ring: Ring, epsilon: number): Ring {
  if (ring.length < 4) return ring;
  const points = ring.map(([x, y]) => ({ x, y }));
  const kept = simplifyJs(points, epsilon, true);
  // Douglas–Peucker pins the endpoints, so a ring that started closed stays closed.
  return kept.length >= 3 ? kept.map(({ x, y }): Point => [x, y]) : ring;
}
