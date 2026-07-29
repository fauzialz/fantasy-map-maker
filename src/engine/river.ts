import type { Point, River } from "../scene/types";
import { chaikin } from "./terrain/smooth";

/**
 * River geometry (WP-8): a clicked polyline becomes a smooth, tapering ribbon.
 *
 * Rivers are deliberately outside the boolean terrain engine (ADR-14) — they never union
 * with land and never take coastal rings, so none of Pipeline A/C applies. What they need
 * is a centreline spline and an outline to fill, both cheap enough to run per render.
 */

/** How wide the source is relative to the mouth. Rivers grow as they run to the sea. */
const SOURCE_FRACTION = 0.3;

/** Corner-cut the clicked points into a centreline, pinning the two the user placed last. */
export const riverCentreline = (points: Point[]): Point[] => chaikin(points, 2, false);

/** Half-width at `t` along the river, 0 at the source and 1 at the mouth. */
const halfWidthAt = (river: River, t: number): number =>
  (river.width / 2) * (river.taper ? SOURCE_FRACTION + (1 - SOURCE_FRACTION) * t : 1);

/**
 * The closed outline of the ribbon: the left bank out to the mouth, the right bank back.
 *
 * A stroked polyline cannot taper — Konva's `strokeWidth` is one number for the whole
 * line — so the taper has to be geometry. Each centreline point is pushed out along the
 * normal of its local tangent, which is a central difference so a bend offsets smoothly
 * instead of kinking at the vertex.
 */
export function riverRibbon(river: River): Point[] {
  const line = riverCentreline(river.points);
  if (line.length < 2) return [];

  const left: Point[] = [];
  const right: Point[] = [];
  for (let i = 0; i < line.length; i++) {
    const [ax, ay] = line[Math.max(i - 1, 0)];
    const [bx, by] = line[Math.min(i + 1, line.length - 1)];
    const length = Math.hypot(bx - ax, by - ay) || 1;
    // Normal of the tangent, unit length.
    const nx = -(by - ay) / length;
    const ny = (bx - ax) / length;
    const half = halfWidthAt(river, i / (line.length - 1));
    const [x, y] = line[i];
    left.push([x + nx * half, y + ny * half]);
    right.push([x - nx * half, y - ny * half]);
  }

  return [...left, ...right.reverse()];
}

/** Distance from a point to the segment ab. */
function distanceToSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  const clamped = Math.min(Math.max(t, 0), 1);
  return Math.hypot(px - (ax + clamped * dx), py - (ay + clamped * dy));
}

/**
 * Distance from a point to the river's drawn centreline.
 *
 * Measured against the smoothed line, not the clicked points: the pointer has to agree
 * with what is on screen, which is the spline (invariant I4 in the interaction log).
 */
export function distanceToRiver(river: River, point: Point): number {
  const line = riverCentreline(river.points);
  if (line.length === 0) return Infinity;
  if (line.length === 1) return Math.hypot(point[0] - line[0][0], point[1] - line[0][1]);

  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    best = Math.min(best, distanceToSegment(point, line[i], line[i + 1]));
  }
  return best;
}

/** Is the point on the river, allowing a little slack for thin rivers at low zoom? */
export const isOnRiver = (river: River, point: Point, slack = 0): boolean =>
  distanceToRiver(river, point) <= river.width / 2 + slack;
