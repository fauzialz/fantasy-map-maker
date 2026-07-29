import { footprint, hasFootprint } from "../scene/bounds";
import type { Point, SceneObject } from "../scene/types";

/**
 * Is this object under the eraser brush?
 *
 * Matching on the anchor alone would mean a big mountain whose body is clearly under the
 * cursor survives because its feet are not, so the footprint counts too — scaled, since
 * a jittered scatter varies object size.
 */
export function isUnderBrush(object: SceneObject, [px, py]: Point, brushRadius: number): boolean {
  if (!hasFootprint(object)) return false;
  const { left, right } = footprint(object);
  return Math.hypot(object.x - px, object.y - py) <= brushRadius + (right - left) * 0.3;
}
