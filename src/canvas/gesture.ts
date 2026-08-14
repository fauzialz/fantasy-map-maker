import { frameContains, type Frame } from "../scene/frame";
import type { Point } from "../scene/types";
import { handleAt, handleKind, type Handle } from "./handles";

export type Gesture =
  /** carries the specific handle, so the drag can keep showing that corner's cursor */
  | { kind: "scale" | "rotate"; handle: Handle }
  | { kind: "move" }
  | { kind: "pick"; additive: boolean }
  | { kind: "marquee"; additive: boolean };

interface Input {
  point: Point;
  /** the selection frame, if anything is selected */
  frame?: Frame;
  /** whether an object lies under the point */
  overObject: boolean;
  shift: boolean;
  scale: number;
  /**
   * Whether the frame's *interior* may claim this press.
   *
   * False when the selection is path-based and the point is not actually over it. A box
   * is a fair stand-in for where a sprite is — it hugs the artwork, and the gaps inside a
   * group of them are still "the group". It is a poor one for a crescent continent, whose
   * AABB is mostly open sea (`08` C4): pressing that water is pressing nothing, and
   * letting the box claim it is the box *picking*, which is what `09` S8 forbids.
   */
  frameInterior?: boolean;
}

/**
 * What a mousedown means, resolved in one place.
 *
 * The order matters and is easy to get subtly wrong: handles beat the frame, the frame beats
 * objects, objects beat empty space. The catch is **shift**, which means "change the
 * selection" — so it has to skip every one of those shortcuts. Without that, shift-clicking
 * an already-selected object lands inside the selection frame and starts a drag instead of
 * deselecting it.
 *
 * **WP-40 removed the rung above all of these**: a river's control point, which outranked the
 * handles because it usually sat exactly on one. Water has no control points — it is an
 * outline like a landmass (ADR-48) — and node editing for both substances is deliberately
 * unscheduled (`16` D3), so nothing claims that rung today. It comes back when node editing
 * is designed, and `07` I5 records the ladder as it now stands.
 */
export function resolveGesture({
  point,
  frame,
  overObject,
  shift,
  scale,
  frameInterior = true,
}: Input): Gesture {
  if (!shift) {
    if (frame) {
      // Handles stay live either way — they are small, deliberate targets sitting on the
      // frame itself, not in the empty space it encloses.
      const handle = handleAt(frame, point, scale);
      if (handle) return { kind: handleKind(handle), handle };
      if (frameInterior && frameContains(frame, point)) return { kind: "move" };
    }
  }
  if (overObject) return { kind: "pick", additive: shift };
  return { kind: "marquee", additive: shift };
}
