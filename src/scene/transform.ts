import type { Landmass, Ring, SceneObject } from "./types";

/**
 * Multi-object transforms. Every one takes the objects as they were when the drag began
 * and returns them transformed absolutely — applying deltas incrementally accumulates
 * rounding drift over a drag, and makes "undo" mean "replay backwards" instead of
 * "restore the snapshot".
 *
 * **Two models, since WP-15** (the I9 rewrite). An object with an anchor moves by its
 * anchor and records its own `rotation`. A landmass has neither: its geometry is absolute
 * (C5), so a transform has nowhere to record itself and **bakes into the points** — which
 * is exactly why only the rigid ones live here. Translation and rotation move every point
 * and degrade nothing; scale does not, because coastline detail is baked in map units at a
 * simplification epsilon chosen at commit time (C3), so a scaled coast has to be
 * re-simplified. That is WP-16's job, and `scaleObjects` still refuses land until then —
 * the guard this file has always carried, now narrowed to the one operation that needs it.
 *
 * Rivers stay untouched by all three until WP-20.
 */

const isPlaced = (object: SceneObject): object is Extract<SceneObject, { x: number; y: number }> =>
  "x" in object && "y" in object;

const isLand = (object: SceneObject): object is Landmass => object.type === "landmass";

/** Apply a point map to a landmass's coastline and every lake in it. */
const remapLand = (landmass: Landmass, move: (point: Ring[number]) => Ring[number]): Landmass => ({
  ...landmass,
  path: landmass.path.map(move),
  holes: landmass.holes.map((hole) => hole.map(move)),
});

export interface Origin {
  x: number;
  y: number;
}

export function translateObjects<T extends SceneObject>(objects: T[], dx: number, dy: number): T[] {
  return objects.map((object) => {
    if (isPlaced(object)) return { ...object, x: object.x + dx, y: object.y + dy } as T;
    if (isLand(object)) return remapLand(object, ([x, y]) => [x + dx, y + dy]) as unknown as T;
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
  // Land is deliberately absent: scaling a coastline invalidates the epsilon it was
  // simplified at (C3), so it needs re-simplification in the worker — WP-16.
  return objects.map((object) =>
    isPlaced(object)
      ? ({
          ...object,
          x: origin.x + (object.x - origin.x) * safe,
          y: origin.y + (object.y - origin.y) * safe,
          scale: Math.max(object.scale * safe, 0.05),
        } as T)
      : object,
  );
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
  const spin = ([x, y]: Ring[number]): Ring[number] => {
    const dx = x - origin.x;
    const dy = y - origin.y;
    return [origin.x + dx * cos - dy * sin, origin.y + dx * sin + dy * cos];
  };

  return objects.map((object) => {
    // A landmass turns by its points alone — there is no `rotation` field to add to, and
    // the renderer draws absolute geometry, so the points *are* the orientation.
    if (isLand(object)) return remapLand(object, spin) as unknown as T;
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
