import polygonClipping from "polygon-clipping";
import { rotateObjects, translateObjects, type Origin } from "../../scene/transform";
import type { Landmass, Point } from "../../scene/types";
import { toIntMulti } from "../geometry/coords";
import { unionLand, splitByComponents } from "./boolean";
import { landmassToPolygon } from "./assemble";

/**
 * WP-15 — what happens when a dragged landmass lands on another one.
 *
 * **C1 says land never overlaps land**, and it is load-bearing rather than tidy: because
 * every drop resolves overlap, at most one landmass contains any given point, so the
 * hit-test needs no "topmost" rule and the `z` a landmass does not have never comes up
 * (`08` §3). Allow resting overlap and draw order, `z` and a topmost rule all return at
 * once. So a drop has to resolve, always.
 */
export type OverlapPolicy = "apart" | "merge";

/**
 * The gesture, described rather than applied — so the resolver can replay it at any
 * fraction. Rotation needs this as much as translation: turning a landmass can bury it in
 * its neighbour just as easily as sliding it, and C1 does not care which gesture broke it.
 */
export type DropGesture =
  { kind: "move"; delta: Point } | { kind: "rotate"; origin: Origin; degrees: number };

export interface ResolveDrop {
  /** the landmasses **as they were when the drag began** (I6) */
  snapshot: Landmass[];
  /** everything else on the terrain layer */
  others: Landmass[];
  gesture: DropGesture;
  policy: OverlapPolicy;
}

export interface DropResult {
  /** the whole terrain layer after resolution */
  landmasses: Landmass[];
  /** fraction of the drag actually applied — 1 unless "apart" had to walk back */
  fraction: number;
  /** true when a merge fused objects, so the caller can report the identity change */
  merged: boolean;
}

const overlaps = (a: Landmass[], b: Landmass[]): boolean => {
  if (a.length === 0 || b.length === 0) return false;
  const left = toIntMulti(a.map(landmassToPolygon));
  const right = toIntMulti(b.map(landmassToPolygon));
  return polygonClipping.intersection(left, right).length > 0;
};

/**
 * The snapshot replayed at fraction `t` of the gesture — `t = 0` is where the drag began,
 * `t = 1` is where it was released. Reuses the very transforms the drag itself used, so
 * the resolved position is one the drag could have produced, not an approximation of one.
 */
const at = (snapshot: Landmass[], gesture: DropGesture, t: number): Landmass[] =>
  gesture.kind === "move"
    ? translateObjects(snapshot, gesture.delta[0] * t, gesture.delta[1] * t)
    : rotateObjects(snapshot, gesture.origin, gesture.degrees * t);

/**
 * How many halvings to spend finding the last position that fit. Ten gets within ~0.1% of
 * the drag length, which at any realistic drag is sub-pixel — and each step is one
 * intersection test, so the whole search is ~10 tests on drop rather than per frame.
 */
const SEARCH_STEPS = 10;

/**
 * "Move it slightly" has no well-defined answer for a concave shape: dropped into a
 * C-shaped bay, the nearest free position can be a thousand units away in a direction
 * nobody dragged, and nudging out of one neighbour can push into another without ever
 * converging. **Sliding back along the drag path** does have one — binary-search the drag
 * vector for the largest fraction that still fits. Deterministic, convergent, and it reads
 * as "it slid back to where it last fit".
 */
function slideBack(snapshot: Landmass[], others: Landmass[], gesture: DropGesture): number {
  // t = 0 is where the drag began, which by C1 was already free.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    if (overlaps(at(snapshot, gesture, mid), others)) hi = mid;
    else lo = mid;
  }
  return lo;
}

export function resolveDrop({ snapshot, others, gesture, policy }: ResolveDrop): DropResult {
  const moved = at(snapshot, gesture, 1);
  if (moved.length === 0 || !overlaps(moved, others)) {
    return { landmasses: [...others, ...moved], fraction: 1, merged: false };
  }

  if (policy === "merge") {
    // Exactly what the brush does on every stroke (S7 + S9), so identity follows ADR-10's
    // rule for free: the larger piece keeps the id and the name.
    const combined = unionLand(moved.map(landmassToPolygon), others.map(landmassToPolygon));
    const landmasses = splitByComponents(combined, [...others, ...moved]);
    return { landmasses, fraction: 1, merged: landmasses.length < others.length + moved.length };
  }

  const fraction = slideBack(snapshot, others, gesture);
  return { landmasses: [...others, ...at(snapshot, gesture, fraction)], fraction, merged: false };
}
