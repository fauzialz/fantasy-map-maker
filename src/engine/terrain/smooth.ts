import simplifyJs from "simplify-js";
import type { Point, Ring } from "../geometry/types";

/**
 * S3 — Chaikin corner cutting on a closed ring. Each iteration replaces every vertex
 * with two points a quarter and three quarters along its outgoing edge, so the point
 * count doubles and hard corners round off.
 */
export function chaikin(ring: Ring, iterations = 2): Ring {
  let current = ring;
  for (let pass = 0; pass < iterations; pass++) {
    if (current.length < 3) return current;
    const next: Ring = [];
    for (let i = 0, n = current.length; i < n; i++) {
      const [x1, y1] = current[i];
      const [x2, y2] = current[(i + 1) % n];
      next.push([x1 * 0.75 + x2 * 0.25, y1 * 0.75 + y2 * 0.25]);
      next.push([x1 * 0.25 + x2 * 0.75, y1 * 0.25 + y2 * 0.75]);
    }
    current = next;
  }
  return current;
}

export const EPSILON_SMOOTH = 8;
export const EPSILON_DETAILED = 0.5;

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
export function simplify(ring: Ring, coastDetail: number): Ring {
  if (ring.length < 4) return ring;
  const points = ring.map(([x, y]) => ({ x, y }));
  const kept = simplifyJs(points, epsilonFor(coastDetail), true);
  // Douglas–Peucker pins the endpoints, so a ring that started closed stays closed.
  return kept.length >= 3 ? kept.map(({ x, y }): Point => [x, y]) : ring;
}
