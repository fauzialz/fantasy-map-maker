import type { Point } from "../../scene/types";

/**
 * Point-to-segment arithmetic, used wherever a pointer is measured against a polyline.
 *
 * Lived in `engine/river.ts` until WP-40 deleted rivers. It was never river-specific — the
 * global eraser asks the same question of a *coastline ring* (WP-26) — so it moves here
 * rather than being copied into whatever survived, which is how two versions of the same
 * arithmetic start drifting.
 */

/** The point on segment ab nearest p. */
export function closestOnSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): Point {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  const clamped = Math.min(Math.max(t, 0), 1);
  return [ax + clamped * dx, ay + clamped * dy];
}

/** Distance from a point to the segment ab. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const [cx, cy] = closestOnSegment(p, a, b);
  return Math.hypot(p[0] - cx, p[1] - cy);
}
