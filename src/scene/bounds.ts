import { spriteBounds } from "../sprites/raster";
import { textBounds } from "../sprites/text";
import { iconVariant, type SpriteKind } from "../sprites/registry";
import { landmassToPolygon } from "../engine/terrain/assemble";
import { pointInPolygon } from "../engine/geometry/nesting";
import type { Landmass, SceneObject } from "./types";

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Objects the sprite renderer draws. Icons are sprites whose variant is named (`kind`). */
export type SpriteObject = Extract<SceneObject, { type: "mountain" | "tree" | "landmark" }>;

export const isSprite = (object: SceneObject): object is SpriteObject =>
  object.type === "mountain" || object.type === "tree" || object.type === "landmark";

/** Where a sprite object sits in the registry — the one place `kind` becomes an index. */
export const spriteRef = (object: SpriteObject): { kind: SpriteKind; variant: number } =>
  object.type === "landmark"
    ? { kind: "landmark", variant: iconVariant(object.kind) }
    : { kind: object.type, variant: object.variant };

/**
 * Everything with an anchor and a drawn box: sprites plus labels.
 *
 * This predicate is the seam the whole interaction stack keys on — hit-testing, the rbush
 * index, the selection frame, the eraser and the transforms all ask it. Anything that
 * answers `true` here is selectable, movable and erasable without further work; anything
 * that does not (landmass, river) is path-based and interacts through its own tool.
 */
export type PlacedObject = SpriteObject | Extract<SceneObject, { type: "label" }>;

export const hasFootprint = (object: SceneObject): object is PlacedObject =>
  isSprite(object) || object.type === "label";

/** The object's drawn box relative to its anchor, before rotation. */
export function footprint(object: PlacedObject) {
  if (object.type === "label") return textBounds(object.text, object.size * object.scale);
  const { kind, variant } = spriteRef(object);
  return spriteBounds(kind, variant, object.scale);
}

/** The four corners of an object's artwork, relative to its anchor, before rotation. */
export function objectCorners(object: PlacedObject): [number, number][] {
  const { left, right, top, bottom } = footprint(object);
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
  if (!hasFootprint(object)) return undefined;

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

/**
 * Every point that has to be inside the selection frame, in **world space**.
 *
 * The two interaction models meet here (I9, rewritten by WP-15). A footprint object
 * contributes the four corners of its artwork, carried out through its own rotation. A
 * landmass contributes its coastline itself — not its box, because a box's corners rotate
 * into the wrong place: measuring a group at an angle un-rotates these points into the
 * frame's basis (I7), and an AABB corner is not a point on the shape.
 */
export function worldCorners(object: SceneObject): [number, number][] {
  if (hasFootprint(object)) {
    return objectCorners(object).map((corner) => {
      const [dx, dy] = rotatePoint(corner, object.rotation);
      return [object.x + dx, object.y + dy];
    });
  }
  // Holes are inside the outer ring by construction, so they cannot widen the box.
  return object.type === "landmass" ? object.path : [];
}

/** Anything a selection frame can be drawn around — the union of both models. */
export const isFramed = (object: SceneObject): boolean =>
  hasFootprint(object) || object.type === "landmass";

/**
 * Which landmass covers this point, if any — the path-based half of the two interaction
 * models (I9). Promoted here from the generator's scatter, because selection needs the same
 * question the scatter asks: is this point on land?
 *
 * `pointInPolygon` is even-odd across every ring, so a point in a lake counts as outside its
 * parent — which is what lets an island inside a lake be clicked rather than the continent
 * around it. That is also `08` C4's requirement, for free.
 */
export const landmassAt = (landmasses: Landmass[], x: number, y: number): Landmass | undefined =>
  landmasses.find((landmass) => pointInPolygon(landmassToPolygon(landmass), [x, y]));

/**
 * A landmass's axis-aligned box.
 *
 * Deliberately **not** part of `objectBounds`, which stays undefined for path objects. That
 * is what keeps landmasses out of the rbush index and out of `frameOf`, so WP-14 gets
 * "selected, but no handles" by construction rather than by remembering to suppress them —
 * a frame whose handles do nothing is the exact failure I9 describes. WP-19 is what widens
 * `objectBounds`, once the transforms behind those handles actually move geometry.
 *
 * Used only for marquee containment, where a box is the right question.
 */
export function landmassBounds(landmass: Landmass): Bounds | undefined {
  if (landmass.path.length === 0) return undefined;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of landmass.path) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, minY, maxX, maxY };
}
