import type { Landmass, Point, River, SceneObject } from "./types";

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
 * **Both path types are here since WP-20**, and they cost the transforms different things.
 * A landmass's coastline detail is baked in map units at a simplification epsilon chosen at
 * commit time (C3), so a scaled coast comes back coarser and has to be re-detailed — once,
 * on drop, in `engine/terrain/rescale.ts`. A river's points are the user's own control
 * points, Chaikin-smoothed at draw time, so all three transforms are **lossless** on it.
 * That is why rivers were the right place to prove this model rather than coastlines.
 */

const isPlaced = (object: SceneObject): object is Extract<SceneObject, { x: number; y: number }> =>
  "x" in object && "y" in object;

/** The other model: absolute geometry, no anchor and no `rotation` to record against. */
const isPath = (object: SceneObject): object is Landmass | River => !isPlaced(object);

/** Apply a point map to a coastline and every lake in it, or to a river's control points. */
const remapPath = (object: Landmass | River, move: (point: Point) => Point): Landmass | River =>
  object.type === "landmass"
    ? {
        ...object,
        path: object.path.map(move),
        holes: object.holes.map((hole) => hole.map(move)),
      }
    : { ...object, points: object.points.map(move) };

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
      const moved = remapPath(object, ([x, y]) => [
        origin.x + (x - origin.x) * safe,
        origin.y + (y - origin.y) * safe,
      ]);
      /**
       * A river keeps its width as a number rather than in its geometry, so scaling the
       * points alone leaves a river stretched to twice the length and still drawn at the
       * old width — a thread. `taper` needs nothing: it is a fraction along the path, and
       * every transform here preserves that.
       */
      return (moved.type === "river"
        ? { ...moved, width: moved.width * safe }
        : moved) as unknown as T;
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
