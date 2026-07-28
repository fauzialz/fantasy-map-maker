import { spriteBounds } from "../sprites/raster";
import type { SceneObject } from "./types";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Map-space box a sprite object occupies. Objects anchor at the foot of the sprite, so
 * the box runs upward from `y` — the same convention the renderer and the Y sort use.
 */
export function objectBounds(object: SceneObject): Bounds | undefined {
  if (object.type !== "mountain" && object.type !== "tree") return undefined;
  const { width, height } = spriteBounds(object.type, object.scale);
  return {
    minX: object.x - width / 2,
    minY: object.y - height,
    maxX: object.x + width / 2,
    maxY: object.y,
  };
}

/** Union of every selectable object's box — the selection frame. */
export function boundsOf(objects: SceneObject[]): Bounds | undefined {
  let result: Bounds | undefined;
  for (const object of objects) {
    const box = objectBounds(object);
    if (!box) continue;
    result = result
      ? {
          minX: Math.min(result.minX, box.minX),
          minY: Math.min(result.minY, box.minY),
          maxX: Math.max(result.maxX, box.maxX),
          maxY: Math.max(result.maxY, box.maxY),
        }
      : box;
  }
  return result;
}

export const boundsCenter = (bounds: Bounds) => ({
  x: (bounds.minX + bounds.maxX) / 2,
  y: (bounds.minY + bounds.maxY) / 2,
});

export const boundsIntersect = (a: Bounds, b: Bounds): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;

export const boundsContainPoint = (bounds: Bounds, x: number, y: number): boolean =>
  x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY;
