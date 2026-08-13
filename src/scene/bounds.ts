import { spriteBounds } from "../sprites/raster";
import { textBounds } from "../sprites/text";
import {
  BASELINE,
  GRID,
  SPRITE_HEIGHT,
  iconVariant,
  spriteExtent,
  spriteRings,
  type SpriteKind,
} from "../sprites/registry";
import { landmassToPolygon } from "../engine/terrain/assemble";
import { pointInPolygon, pointInRing } from "../engine/geometry/nesting";
import type { Landmass, SceneObject, Water } from "./types";

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
 * that does not (landmass, water) is path-based and interacts through its own geometry.
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

/**
 * Does the object's **drawn artwork** cover this point, as opposed to its box (ADR-30)?
 *
 * The box is a loose stand-in for the shape: measured, ink fills 53% of a mountain's box,
 * 50% of a tree's, and **28% of the compass's** — a four-armed star is mostly the gaps
 * between the arms. This is the question `SpatialIndex.hit` asks to break a tie between
 * overlapping candidates.
 *
 * **Labels are exempt and answer yes anywhere in their box** (F2). Picking text by hitting
 * an actual letter stroke would be miserable, and the gaps between words are part of the
 * thing you are pointing at. That is a deliberate inconsistency, not an oversight.
 *
 * Canvas-free on purpose (`10` P4): the point is carried back into the sprite's own grid
 * and ray-cast against the flattened path, so this works in Node like every other bound.
 *
 * ponytail: two known approximations, both of which fail *towards* the old behaviour
 * because this is a tie-break and a "no" merely falls back to topmost-by-Y. Rings are
 * unioned rather than even-odd, so a sprite drawn with a genuine hole would read as
 * filled — none is, and the trunk/foliage overlap in a tree is why union is the right
 * default. And the 2.6-wide stroke is not included, so a point on the outer edge of the
 * ink can read as outside. Give rings a signed offset if either ever shows.
 */
export function coversPoint(object: PlacedObject, x: number, y: number): boolean {
  if (object.type === "label") return true;
  const { kind, variant } = spriteRef(object);
  const unit = (SPRITE_HEIGHT[kind] * (GRID / BASELINE) * object.scale) / GRID;
  if (!unit) return false;

  const extent = spriteExtent(kind, variant);
  const [dx, dy] = rotatePoint([x - object.x, y - object.y], -object.rotation);
  const point: [number, number] = [
    dx / unit + (extent.minX + extent.maxX) / 2,
    dy / unit + BASELINE,
  ];
  return spriteRings(kind, variant).some((ring) => pointInRing(ring, point));
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
  /**
   * Both path types answer with their outline, and holes cannot widen a box because they are
   * inside the outer ring by construction.
   *
   * **WP-40 deleted the river case that used to sit here**, which grew each control point by
   * half the maximum width to bound a ribbon that was never stored. Water has no centreline
   * and no width — the outline *is* the object (ADR-48) — so the superset it needed is gone
   * along with the slack it cost.
   */
  return object.type === "landmass" || object.type === "water" ? object.path : [];
}

/** Anything a selection frame can be drawn around — the union of both models. */
export const isFramed = (object: SceneObject): boolean =>
  hasFootprint(object) || object.type === "landmass" || object.type === "water";

/**
 * Which object in this collection covers the point, if any — the path-based half of the two
 * interaction models (I9). Promoted here from the generator's scatter, because selection needs
 * the same question the scatter asks: is this point on land?
 *
 * **Generic over the substance since WP-41.** It never cared which one it was given: the
 * question is "point in this polygon collection", and land and water are the same shape
 * (ADR-48). Keeping the name is deliberate — a second identically-bodied `waterAt` is exactly
 * the special case `16` exists to avoid — and the caller's precedence is what decides which
 * collection is asked first.
 *
 * `pointInPolygon` is even-odd across every ring, so a point in a lake counts as outside its
 * parent — which is what lets an island inside a lake be clicked rather than the continent
 * around it. That is also `08` C4's requirement, for free.
 */
export const landmassAt = <T extends Landmass | Water>(
  landmasses: T[],
  x: number,
  y: number,
): T | undefined =>
  landmasses.find((object) => pointInPolygon([object.path, ...object.holes], [x, y]));

/**
 * What stands on a landmass — the double-click gesture of WP-19 (`09` §4, item 8).
 *
 * Membership is the **anchor**, not the box: a sprite's `x,y` is its feet (`07` §4), so a
 * mountain whose artwork overhangs the water is still standing on the land, and asking the
 * box would make that a matter of which way it leans. Path objects are deliberately out —
 * a river crossing three continents is not standing on any of them, and this gesture exists
 * to pick up a continent's *contents* rather than everything it touches.
 *
 * Even-odd through the lakes for free: something on an island in a lake belongs to the
 * island, not to the continent around it, and `landmassAt` already answers it that way.
 */
export const standingOn = (landmass: Landmass, objects: SceneObject[]): PlacedObject[] => {
  const polygon = landmassToPolygon(landmass);
  return objects.filter(
    (object): object is PlacedObject =>
      hasFootprint(object) && pointInPolygon(polygon, [object.x, object.y]),
  );
};

/**
 * A path-based object's axis-aligned box — a landmass's coastline, or a water body's outline.
 *
 * Deliberately **not** part of `objectBounds`, which stays undefined for path objects. That
 * is what keeps them out of the rbush index, and so out of `index.hit`, where a box would
 * pick a crescent continent by its open sea and a corner-to-corner river by empty water
 * (`09` S8). Picking goes through the path; only **marquee containment** goes through the
 * box, because there a box is the right question.
 */
export function pathBounds(object: SceneObject): Bounds | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of worldCorners(object)) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return minX === Infinity ? undefined : { minX, minY, maxX, maxY };
}
