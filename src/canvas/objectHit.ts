import type { Point, SceneObject } from "../scene/types";
import { spriteBounds } from "../sprites/raster";

/** Objects the sprite renderer can draw — the ones the object eraser can pick up. */
export const isSpriteObject = (
  object: SceneObject,
): object is Extract<SceneObject, { type: "mountain" | "tree" }> =>
  object.type === "mountain" || object.type === "tree";

/**
 * Is this object under the eraser brush?
 *
 * Matching on the anchor alone would mean a big mountain whose body is clearly under the
 * cursor survives because its feet are not, so the footprint counts too — scaled, since
 * a jittered scatter varies object size.
 */
export function isUnderBrush(object: SceneObject, [px, py]: Point, brushRadius: number): boolean {
  if (!isSpriteObject(object)) return false;
  const { width } = spriteBounds(object.type, object.scale);
  return Math.hypot(object.x - px, object.y - py) <= brushRadius + width * 0.3;
}
