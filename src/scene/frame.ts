import { hasFootprint, isFramed, objectCorners, rotatePoint, worldCorners } from "./bounds";
import type { Point, SceneObject } from "./types";

/**
 * The selection frame: a centre, a size, and an angle.
 *
 * For a single object the frame is **oriented** — it turns with the object, so the frame
 * always describes the sprite as drawn rather than a loose box around it. For a
 * multi-selection the objects can point in different directions, so there is no shared
 * angle to adopt and the frame falls back to the axis-aligned union.
 */
export interface Frame {
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** degrees */
  rotation: number;
}

/**
 * @param rotation angle to measure a multi-selection's box at. A single object always
 * uses its own rotation; a group has no inherent angle, so the caller supplies one that
 * lives only as long as the selection does.
 */
export function frameOf(objects: SceneObject[], rotation = 0): Frame | undefined {
  const framed = objects.filter(isFramed);
  if (framed.length === 0) return undefined;

  // A lone sprite keeps its own angle. A landmass has no `rotation` field to keep (C5), so
  // even one on its own measures in the session basis, the way a group does.
  if (framed.length === 1 && hasFootprint(framed[0])) {
    const object = framed[0];
    const corners = objectCorners(object);
    const [left, top] = corners[0];
    const [right, bottom] = corners[2];
    // Centre of the artwork, carried out to where rotation actually puts it.
    const [dx, dy] = rotatePoint([(left + right) / 2, (top + bottom) / 2], object.rotation);
    return {
      cx: object.x + dx,
      cy: object.y + dy,
      width: right - left,
      height: bottom - top,
      rotation: object.rotation,
    };
  }

  /**
   * Measure the group in the frame's own basis rather than the world's: un-rotate every
   * corner by the frame angle, take the box there, and carry it back. Rotating an
   * axis-aligned union instead would make the frame breathe as the group turns, because
   * an AABB grows and shrinks with the angle of what it contains.
   */
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const object of framed) {
    for (const point of worldCorners(object)) {
      const [lx, ly] = rotatePoint(point, -rotation);
      minX = Math.min(minX, lx);
      minY = Math.min(minY, ly);
      maxX = Math.max(maxX, lx);
      maxY = Math.max(maxY, ly);
    }
  }
  if (minX === Infinity) return undefined;

  const [cx, cy] = rotatePoint([(minX + maxX) / 2, (minY + maxY) / 2], rotation);
  return { cx, cy, width: maxX - minX, height: maxY - minY, rotation };
}

/**
 * Map space → frame space: centred on the frame and un-rotated, so every hit test can be
 * written as if the frame were axis-aligned.
 */
export function toFrameLocal(frame: Frame, [x, y]: Point): Point {
  const [lx, ly] = rotatePoint([x - frame.cx, y - frame.cy], -frame.rotation);
  return [lx, ly];
}

export const toFrameWorld = (frame: Frame, local: Point): Point => {
  const [dx, dy] = rotatePoint(local, frame.rotation);
  return [frame.cx + dx, frame.cy + dy];
};

/** Corner order: nw, ne, se, sw — in world space, rotated with the frame. */
export function frameCorners(frame: Frame): Point[] {
  const hw = frame.width / 2;
  const hh = frame.height / 2;
  return (
    [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ] as Point[]
  ).map((local) => toFrameWorld(frame, local));
}

/** Rotating in and back out lands a boundary point a hair either side of the edge. */
const EDGE_EPSILON = 1e-9;

export function frameContains(frame: Frame, point: Point): boolean {
  const [x, y] = toFrameLocal(frame, point);
  return (
    Math.abs(x) <= frame.width / 2 + EDGE_EPSILON && Math.abs(y) <= frame.height / 2 + EDGE_EPSILON
  );
}
