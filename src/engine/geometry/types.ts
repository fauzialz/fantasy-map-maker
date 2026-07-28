import type { Point, Ring } from "../../scene/types";

export type { Point, Ring };

/** [outer, ...holes] — the same shape polygon-clipping and GeoJSON use. */
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

/**
 * Rings are stored **open**: the closing point is implied, never duplicated. Convert at
 * the polygon-clipping boundary with `closeRing`, which is the only place a duplicated
 * last point exists.
 */
export const closeRing = (ring: Ring): Ring => (ring.length === 0 ? ring : [...ring, ring[0]]);

export const openRing = (ring: Ring): Ring => {
  if (ring.length < 2) return ring;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  return fx === lx && fy === ly ? ring.slice(0, -1) : ring;
};

/**
 * Shoelace signed area. Positive = counter-clockwise by the algebraic convention used
 * throughout (map-space has y pointing down, so this reads clockwise on screen — what
 * matters is that outers and holes have opposite signs, per the pipeline spec).
 */
export function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export const ringArea = (ring: Ring): number => Math.abs(signedArea(ring));

/** Area of a polygon-with-holes: outer minus every hole. */
export const polygonArea = (polygon: Polygon): number =>
  polygon.reduce((total, ring, i) => (i === 0 ? ringArea(ring) : total - ringArea(ring)), 0);

export const multiPolygonArea = (multi: MultiPolygon): number =>
  multi.reduce((total, polygon) => total + polygonArea(polygon), 0);

/** Axis-aligned rectangle in map-space. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
