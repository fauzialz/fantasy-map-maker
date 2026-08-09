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

/**
 * Half-width at `t` along the river, 0 at the source and 1 at the mouth.
 *
 * Exported since WP-29: a tributary has to overshoot the trunk's centreline by the trunk's
 * *local* half-width to bury its cap, and a tapering trunk is a different width at each point.
 */
export const halfWidthAt = (river: River, t: number): number =>
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

  return [...left, ...endCap(river, line, left[left.length - 1]), ...right.reverse()];
}

/** How many segments approximate the half-circle at the mouth. Six reads as round at any zoom. */
const CAP_STEPS = 6;

/**
 * WP-29 (`13` D6) — the mouth is a half-circle rather than the flat chord `riverRibbon` used
 * to close with, so a river that stops in open water fades out instead of looking sliced off.
 *
 * Nothing is stored for this and no pass is added: the outline already had to close between
 * the last left and right bank points, and this is that closure bulged out along the tangent.
 * The two bank ends sit at ±normal × halfWidth from the centreline, so the sweep is exactly a
 * half turn — the tangent only decides which way round.
 */
function endCap(river: River, line: Point[], leftEnd: Point): Point[] {
  const n = line.length;
  const [cx, cy] = line[n - 1];
  const radius = halfWidthAt(river, 1);
  if (radius <= 0) return [];

  const [px, py] = line[n - 2];
  const from = Math.atan2(leftEnd[1] - cy, leftEnd[0] - cx);
  // Bulge along the flow, never back into the river.
  let toward = Math.atan2(cy - py, cx - px) - from;
  while (toward > Math.PI) toward -= 2 * Math.PI;
  while (toward < -Math.PI) toward += 2 * Math.PI;
  const direction = toward >= 0 ? 1 : -1;

  const arc: Point[] = [];
  for (let i = 1; i < CAP_STEPS; i++) {
    const angle = from + (direction * Math.PI * i) / CAP_STEPS;
    arc.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
  }
  return arc;
}

/**
 * The point on segment ab nearest p.
 *
 * WP-29 needs the *place*, not just the distance — a snap has to land somewhere — so the
 * projection lives here once and `distanceToSegment` measures to whatever it returns. Two
 * copies of this arithmetic would be two places for it to drift.
 */
export function closestOnSegment([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): Point {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  const clamped = Math.min(Math.max(t, 0), 1);
  return [ax + clamped * dx, ay + clamped * dy];
}

/**
 * Distance from a point to the segment ab.
 *
 * Exported since WP-26: the global eraser needs the same question asked of a *coastline
 * ring*, and a second copy of this would be a second place for it to be wrong.
 */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const [cx, cy] = closestOnSegment(p, a, b);
  return Math.hypot(p[0] - cx, p[1] - cy);
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
