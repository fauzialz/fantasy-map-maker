import { boundsContainPoint, type Bounds } from "../scene/bounds";
import type { Point } from "../scene/types";
import { handleAt, handleKind } from "./handles";

export type Gesture =
  | { kind: "scale" | "rotate" }
  | { kind: "move" }
  | { kind: "pick"; additive: boolean }
  | { kind: "marquee"; additive: boolean };

interface Input {
  point: Point;
  /** frame around the current selection, if anything is selected */
  bounds?: Bounds;
  selectionCount: number;
  /** whether an object lies under the point */
  overObject: boolean;
  shift: boolean;
  scale: number;
}

/**
 * What a mousedown means, resolved in one place.
 *
 * The order matters and is easy to get subtly wrong: handles beat the frame, the frame
 * beats objects, objects beat empty space. The catch is **shift**, which means "change
 * the selection" — so it has to skip the handle and frame shortcuts entirely. Without
 * that, shift-clicking an already-selected object lands inside the selection frame and
 * starts a drag instead of deselecting it.
 */
export function resolveGesture({
  point,
  bounds,
  selectionCount,
  overObject,
  shift,
  scale,
}: Input): Gesture {
  if (!shift && bounds && selectionCount > 0) {
    const handle = handleAt(bounds, point, scale);
    if (handle) return { kind: handleKind(handle) };
    if (boundsContainPoint(bounds, point[0], point[1])) return { kind: "move" };
  }
  if (overObject) return { kind: "pick", additive: shift };
  return { kind: "marquee", additive: shift };
}
