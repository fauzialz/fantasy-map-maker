import { spriteBounds } from "../sprites/raster";
import type { SceneObject } from "./types";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export type SpriteObject = Extract<SceneObject, { type: "mountain" | "tree" }>;

export const isSprite = (object: SceneObject): object is SpriteObject =>
  object.type === "mountain" || object.type === "tree";

/** The four corners of a sprite's artwork, relative to its anchor, before rotation. */
export function objectCorners(object: SpriteObject): [number, number][] {
  const { left, right, top, bottom } = spriteBounds(object.type, object.variant, object.scale);
  return [
    [left, top],
    [right, top],
    [right, bottom],
    [left, bottom],
  ];
}

export const rotatePoint = ([x, y]: [number, number], degrees: number): [number, number] => {
  if (!degrees) return [x, y];
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return [x * cos - y * sin, x * sin + y * cos];
};

/**
 * Axis-aligned box a sprite occupies in map space, rotation included.
 *
 * This is the box the spatial index and the eraser use: rbush is axis-aligned, so a
 * turned sprite is indexed by the AABB around it. The *selection frame* is a different
 * thing — see `frameOf`, which stays oriented with the object.
 */
export function objectBounds(object: SceneObject): Bounds | undefined {
  if (!isSprite(object)) return undefined;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const corner of objectCorners(object)) {
    const [dx, dy] = rotatePoint(corner, object.rotation);
    minX = Math.min(minX, object.x + dx);
    minY = Math.min(minY, object.y + dy);
    maxX = Math.max(maxX, object.x + dx);
    maxY = Math.max(maxY, object.y + dy);
  }
  return { minX, minY, maxX, maxY };
}

/** Union of every selectable object's box. */
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
