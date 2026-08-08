import { pointInPolygon } from "../engine/geometry/nesting";
import { distanceToSegment, isOnRiver } from "../engine/river";
import { landmassToPolygon } from "../engine/terrain/assemble";
import { footprint, hasFootprint } from "../scene/bounds";
import type { Landmass, Point, Ring, SceneObject } from "../scene/types";

/** Nearest approach from a point to a closed ring — the coastline, walked as segments. */
function distanceToRing(ring: Ring, point: Point): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++)
    best = Math.min(best, distanceToSegment(point, ring[i], ring[(i + 1) % ring.length]));
  return best;
}

/**
 * On the land, or close enough to its coast that the disc overlaps it. Lakes count as
 * coastline too — `pointInPolygon` is even-odd, so a point in a lake reads as outside, and
 * the ring walk then catches a brush nibbling at the lake's shore.
 *
 * ponytail: no bounding-box reject before the ring walk. A map holds a handful of
 * landmasses of a few hundred points each — a few thousand segment tests per mousemove,
 * against the 1–2k object budget the sibling scan already accepts. `pathBounds` is the
 * upgrade if a map ever carries enough coastline to feel it.
 */
const touchesLandmass = (landmass: Landmass, point: Point, radius: number): boolean =>
  pointInPolygon(landmassToPolygon(landmass), point) ||
  distanceToRing(landmass.path, point) <= radius ||
  landmass.holes.some((hole) => distanceToRing(hole, point) <= radius);

/**
 * Is this object under the eraser brush?
 *
 * Matching on the anchor alone would mean a big mountain whose body is clearly under the
 * cursor survives because its feet are not, so the footprint counts too — scaled, since
 * a jittered scatter varies object size.
 *
 * **Path objects answer the same question whole (WP-26, ADR-37).** Until this package
 * `hasFootprint` returned false for landmasses and rivers, so those two were not erasable
 * by any tool at any time — the scoped eraser's real defect, not its scope. They are asked
 * "does the disc touch you", never "how much of you", because partial removal of a path
 * object is a *reshape*: that is the sea brush's job on land and Select's on a river.
 */
export function isUnderBrush(object: SceneObject, point: Point, brushRadius: number): boolean {
  if (object.type === "landmass") return touchesLandmass(object, point, brushRadius);
  if (object.type === "river") return isOnRiver(object, point, brushRadius);
  if (!hasFootprint(object)) return false;
  const { left, right } = footprint(object);
  return Math.hypot(object.x - point[0], object.y - point[1]) <= brushRadius + (right - left) * 0.3;
}
