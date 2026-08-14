import type { Landmass, Point, SceneObject, Water } from "./types";

/**
 * Multi-object transforms. Every one takes the objects as they were when the drag began
 * and returns them transformed absolutely — applying deltas incrementally accumulates
 * rounding drift over a drag, and makes "undo" mean "replay backwards" instead of
 * "restore the snapshot".
 *
 * **Two models, since WP-15** (the I9 rewrite). An object with an anchor moves by its
 * anchor and records its own `rotation`. A path-based object has neither: its geometry is
 * absolute (C5), so a transform has nowhere to record itself and **bakes into the points**.
 *
 * **Both path types are outlines since WP-40**, so they transform through one code path
 * rather than two. What differs is the cost: a landmass's coastline detail is baked in map
 * units at a simplification epsilon chosen at commit time (C3), so a scaled coast comes back
 * coarser and has to be re-detailed — once, on drop, in `engine/terrain/rescale.ts`. Water is
 * the same geometry and inherits the same caveat, which is a change from WP-20: a river was a
 * centreline plus a `width` number, and scaling it was lossless precisely because the width
 * was not geometry. It is now (ADR-48), so there is nothing left to multiply.
 */

const isPlaced = (object: SceneObject): object is Extract<SceneObject, { x: number; y: number }> =>
  "x" in object && "y" in object;

/** The other model: absolute geometry, no anchor and no `rotation` to record against. */
const isPath = (object: SceneObject): object is Landmass | Water => !isPlaced(object);

/**
 * Apply a point map to an outline and every hole in it.
 *
 * One branch for both substances, which is `16`'s "no special cases" showing up as deleted
 * code: land and water are the same shape, so they move the same way.
 */
const remapPath = <T extends Landmass | Water>(object: T, move: (point: Point) => Point): T => ({
  ...object,
  path: object.path.map(move),
  holes: object.holes.map((hole) => hole.map(move)),
});

export interface Origin {
  x: number;
  y: number;
}

export function translateObjects<T extends SceneObject>(objects: T[], dx: number, dy: number): T[] {
  return objects.map((object) => {
    if (isPlaced(object)) return { ...object, x: object.x + dx, y: object.y + dy } as T;
    if (isPath(object)) return remapPath(object, ([x, y]) => [x + dx, y + dy]) as unknown as T;
    return object;
  });
}

/** Scale about an origin: positions move outward and each object grows by the factor. */
export function scaleObjects<T extends SceneObject>(
  objects: T[],
  origin: Origin,
  factor: number,
): T[] {
  const safe = Math.max(factor, 0.05);
  /**
   * Land scales here, but only its points — the **re-detailing** it needs afterwards
   * (C3: ε is in map units, so scaling scales the allowed deviation too) happens once on
   * drop, in the worker, not on every frame of a drag. `engine/terrain/rescale.ts`.
   */
  return objects.map((object) => {
    if (isPath(object)) {
      return remapPath(object, ([x, y]) => [
        origin.x + (x - origin.x) * safe,
        origin.y + (y - origin.y) * safe,
      ]) as unknown as T;
    }
    if (!isPlaced(object)) return object;
    return {
      ...object,
      x: origin.x + (object.x - origin.x) * safe,
      y: origin.y + (object.y - origin.y) * safe,
      scale: Math.max(object.scale * safe, 0.05),
    } as T;
  });
}

/** Rotate about an origin: positions swing around it and each object turns with them. */
export function rotateObjects<T extends SceneObject>(
  objects: T[],
  origin: Origin,
  degrees: number,
): T[] {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const spin = ([x, y]: Point): Point => {
    const dx = x - origin.x;
    const dy = y - origin.y;
    return [origin.x + dx * cos - dy * sin, origin.y + dx * sin + dy * cos];
  };

  return objects.map((object) => {
    // A path object turns by its points alone — there is no `rotation` field to add to, and
    // the renderer draws absolute geometry, so the points *are* the orientation.
    if (isPath(object)) return remapPath(object, spin) as unknown as T;
    if (!isPlaced(object)) return object;
    const [x, y] = spin([object.x, object.y]);
    return { ...object, x, y, rotation: object.rotation + degrees } as T;
  });
}

/**
 * Bring-forward / send-back set the manual `z` that outranks the Y sort (data model §5).
 * Moving past the current extreme is what makes the action always visible.
 */
export function restack<T extends SceneObject>(all: T[], ids: Set<string>, direction: 1 | -1): T[] {
  const zs = all.map((object) => ("z" in object ? object.z : 0));
  const target = direction === 1 ? Math.max(0, ...zs) + 1 : Math.min(0, ...zs) - 1;
  return all.map((object) =>
    ids.has(object.id) && "z" in object ? ({ ...object, z: target } as T) : object,
  );
}
