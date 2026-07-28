import { ringArea, type MultiPolygon, type Point, type Ring } from "./types";

/** Ray-cast a point against one ring. */
export function pointInRing(ring: Ring, [px, py]: Point): boolean {
  let inside = false;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Even-odd across every ring of a polygon, so a point in a lake counts as outside. */
export const pointInPolygon = (polygon: Ring[], point: Point): boolean =>
  polygon.reduce((inside, ring) => (pointInRing(ring, point) ? !inside : inside), false);

export const pointInMultiPolygon = (multi: MultiPolygon, point: Point): boolean =>
  multi.some((polygon) => pointInPolygon(polygon, point));

/**
 * Rebuild polygons-with-holes from a flat list of non-intersecting rings.
 *
 * polygon-offset returns rings with no grouping and with the winding inverted, so
 * neither the order nor the sign can be trusted. Containment can: a ring nested inside
 * an odd number of others is a hole, and it belongs to the smallest ring containing it.
 */
export function groupRingsByNesting(rings: Ring[]): MultiPolygon {
  const usable = rings.filter((ring) => ring.length >= 3 && ringArea(ring) > 0);
  const depth = usable.map(
    (ring, i) => usable.filter((other, j) => j !== i && pointInRing(other, ring[0])).length,
  );

  const outers = usable.filter((_, i) => depth[i] % 2 === 0);
  const polygons: MultiPolygon = outers.map((outer) => [outer]);

  usable.forEach((ring, i) => {
    if (depth[i] % 2 === 0) return;
    let best = -1;
    let bestArea = Infinity;
    outers.forEach((outer, k) => {
      if (!pointInRing(outer, ring[0])) return;
      const area = ringArea(outer);
      if (area < bestArea) {
        bestArea = area;
        best = k;
      }
    });
    if (best >= 0) polygons[best].push(ring);
  });

  return polygons;
}
