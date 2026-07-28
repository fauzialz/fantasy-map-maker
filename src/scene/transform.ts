import type { SceneObject } from "./types";

/**
 * Multi-object transforms. Every one takes the objects as they were when the drag began
 * and returns them transformed absolutely — applying deltas incrementally accumulates
 * rounding drift over a drag, and makes "undo" mean "replay backwards" instead of
 * "restore the snapshot".
 *
 * Only objects with an anchor move; path-based objects (landmass, river) are returned
 * untouched, so a selection can never silently deform terrain.
 */

const isPlaced = (object: SceneObject): object is Extract<SceneObject, { x: number; y: number }> =>
  "x" in object && "y" in object;

export interface Origin {
  x: number;
  y: number;
}

export function translateObjects<T extends SceneObject>(objects: T[], dx: number, dy: number): T[] {
  return objects.map((object) =>
    isPlaced(object) ? ({ ...object, x: object.x + dx, y: object.y + dy } as T) : object,
  );
}

/** Scale about an origin: positions move outward and each object grows by the factor. */
export function scaleObjects<T extends SceneObject>(
  objects: T[],
  origin: Origin,
  factor: number,
): T[] {
  const safe = Math.max(factor, 0.05);
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
  return objects.map((object) => {
    if (!isPlaced(object)) return object;
    const dx = object.x - origin.x;
    const dy = object.y - origin.y;
    return {
      ...object,
      x: origin.x + dx * cos - dy * sin,
      y: origin.y + dx * sin + dy * cos,
      rotation: object.rotation + degrees,
    } as T;
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
