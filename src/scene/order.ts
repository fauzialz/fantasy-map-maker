import type { SceneObject } from "./types";

/** Path-based objects (landmass, river) have no anchor; they never take part in sorting. */
const anchorY = (object: SceneObject): number => ("y" in object ? object.y : 0);
const scaleOf = (object: SceneObject): number => ("scale" in object ? object.scale : 1);
const zOf = (object: SceneObject): number => ("z" in object ? object.z : 0);

/**
 * Effective draw order inside a layer (data model §5): `(z, y, scale)` in that priority.
 *
 * - manual `z` first, so bring-forward / send-back always wins;
 * - then Y, so things lower on the map are in front — the depth cue that makes a
 *   scattered range read as a range;
 * - then scale, so a bigger tree sits in front of a smaller one at the same height.
 */
export const compareDrawOrder = (a: SceneObject, b: SceneObject): number =>
  zOf(a) - zOf(b) || anchorY(a) - anchorY(b) || scaleOf(a) - scaleOf(b);

/** Sorted copy — the array order in the scene stays the creation order. */
export const inDrawOrder = <T extends SceneObject>(objects: T[]): T[] =>
  [...objects].sort(compareDrawOrder);
