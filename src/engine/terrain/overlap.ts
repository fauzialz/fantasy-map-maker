import polygonClipping from "polygon-clipping";
import { rotateObjects, scaleObjects, translateObjects, type Origin } from "../../scene/transform";
import type { Landmass, Point } from "../../scene/types";
import { toIntMulti } from "../geometry/coords";
import type { Rect } from "../geometry/types";
import { multiPolygonArea } from "../geometry/types";
import { offsetGrow } from "../rings/rings";
import { unionLand, differenceLand, splitByComponents } from "./boolean";
import { landmassToPolygon } from "./assemble";
import { rescaleCoast } from "./rescale";
import { roughenCut } from "./roughen";

/**
 * WP-15 — what happens when a dragged landmass lands on another one.
 *
 * **C1 says land never overlaps land**, and it is load-bearing rather than tidy: because
 * every drop resolves overlap, at most one landmass contains any given point, so the
 * hit-test needs no "topmost" rule and the `z` a landmass does not have never comes up
 * (`08` §3). Allow resting overlap and draw order, `z` and a topmost rule all return at
 * once. So a drop has to resolve, always.
 */
export type OverlapPolicy = "apart" | "merge" | "carve";

/**
 * The gesture, described rather than applied — so the resolver can replay it at any
 * fraction. Rotation needs this as much as translation: turning a landmass can bury it in
 * its neighbour just as easily as sliding it, and C1 does not care which gesture broke it.
 */
export type DropGesture =
  | { kind: "move"; delta: Point }
  | { kind: "rotate"; origin: Origin; degrees: number }
  | { kind: "scale"; origin: Origin; factor: number };

export interface ResolveDrop {
  /** the landmasses **as they were when the drag began** (I6) */
  snapshot: Landmass[];
  /** everything else on the terrain layer */
  others: Landmass[];
  gesture: DropGesture;
  policy: OverlapPolicy;
  /** the map rect — a drop must leave the landmass at least touching it */
  canvas: Rect;
  /** scene coastDetail, for re-detailing a scaled coast (WP-16) */
  coastDetail: number;
  /** channel width for a carve, in map units — the scene's ringGap (WP-17) */
  gap: number;
}

export interface DropResult {
  /** the whole terrain layer after resolution */
  landmasses: Landmass[];
  /** fraction of the drag actually applied — 1 unless "apart" had to walk back */
  fraction: number;
  /** true when a merge fused objects, so the caller can report the identity change */
  merged: boolean;
  /** how many pieces a carve left the dragged land in; 1 unless it cut it apart */
  pieces?: number;
  /** a carve that would have annihilated the land, so it slid back instead */
  refused?: boolean;
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
const at = (snapshot: Landmass[], gesture: DropGesture, t: number): Landmass[] => {
  if (gesture.kind === "move")
    return translateObjects(snapshot, gesture.delta[0] * t, gesture.delta[1] * t);
  if (gesture.kind === "rotate")
    return rotateObjects(snapshot, gesture.origin, gesture.degrees * t);
  // Scale interpolates from 1, not from 0: t = 0 has to mean "as it was".
  return scaleObjects(snapshot, gesture.origin, 1 + (gesture.factor - 1) * t);
};

/**
 * A landmass may hang off the edge — the canvas is bounded (ADR-02) and rings clip to it —
 * but it may not leave entirely, or a drag would put it somewhere unreachable with no way
 * back except undo. Folded into the same predicate as overlap so one search satisfies both:
 * "fits" means legal, whatever made it illegal.
 */
const onCanvas = (landmasses: Landmass[], canvas: Rect): boolean =>
  landmasses.every((landmass) => {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const [x, y] of landmass.path) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return (
      minX < canvas.x + canvas.w && maxX > canvas.x && minY < canvas.y + canvas.h && maxY > canvas.y
    );
  });

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
function slideBack(
  snapshot: Landmass[],
  others: Landmass[],
  gesture: DropGesture,
  canvas: Rect,
): number {
  // t = 0 is where the drag began, which by C1 was already free and on the canvas.
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const mid = (lo + hi) / 2;
    const candidate = at(snapshot, gesture, mid);
    if (overlaps(candidate, others) || !onCanvas(candidate, canvas)) hi = mid;
    else lo = mid;
  }
  return lo;
}

/**
 * Put a scaled coast back at the map's level of detail (WP-16). Done **once**, at the end,
 * on the resolved geometry — never inside the search, which would run it ten times.
 *
 * Re-detailing moves the boundary by up to ε, and the slide-back deliberately stops just
 * shy of touching, so it can introduce a sliver of overlap. One check afterwards is enough:
 * if it does, keep the geometry that was known to fit. Coarser, but C1 holds.
 */
function reDetail(
  moved: Landmass[],
  others: Landmass[],
  gesture: DropGesture,
  coastDetail: number,
): Landmass[] {
  if (gesture.kind !== "scale") return moved;
  const detailed = moved.map((landmass) => rescaleCoast(landmass, gesture.factor, coastDetail));
  return overlaps(detailed, others) ? moved : detailed;
}

/**
 * The third outcome: bite a channel through the dragged land where it met the other, then
 * make the cut look like a coast rather than a machine pass.
 *
 * Two of `08` §5's three hazards are handled here; the third is `roughen.ts`.
 *
 * - **It can split the dragged landmass.** That falls out of `splitByComponents`, which
 *   also settles identity by ADR-10 — the larger piece keeps the id and the name — but the
 *   caller has to *say so*, hence `pieces`.
 * - **It can annihilate it**, when the dragged land is smaller than the other's grown
 *   footprint. Silently deleting what someone just dragged is not an acceptable outcome,
 *   so a carve leaving less than a fifth of the original area **refuses** and the drop
 *   falls back to sliding apart.
 */
const CARVE_MIN_AREA = 0.2;

function carve(
  moved: Landmass[],
  others: Landmass[],
  gap: number,
  coastDetail: number,
): { landmasses: Landmass[]; pieces: number } | null {
  const movedPolys = moved.map(landmassToPolygon);
  const grown = offsetGrow(others.map(landmassToPolygon), gap);
  const cut = differenceLand(movedPolys, grown);

  const before = multiPolygonArea(movedPolys);
  if (before === 0 || multiPolygonArea(cut) < before * CARVE_MIN_AREA) return null;

  const roughened = roughenCut(cut, movedPolys, {
    // Comfortably under the channel width, so a wiggle narrows the strait without
    // closing it — and the overlap check below is what guarantees that rather than hopes.
    amplitude: gap * 0.3,
    wavelength: gap * 3,
    coastDetail,
    seed: moved.map((landmass) => landmass.id).join("+"),
  });

  const pieces = splitByComponents(roughened, moved);
  // Roughening pushes points both ways, so it can nibble back into the other coast.
  // Same fallback shape as WP-16's re-detailing: keep the geometry known to be legal.
  const safe = overlaps(pieces, others) ? splitByComponents(cut, moved) : pieces;
  return { landmasses: [...others, ...safe], pieces: safe.length };
}

export function resolveDrop({
  snapshot,
  others,
  gesture,
  policy,
  canvas,
  coastDetail,
  gap,
}: ResolveDrop): DropResult {
  const dropped = at(snapshot, gesture, 1);
  if (dropped.length === 0 || (!overlaps(dropped, others) && onCanvas(dropped, canvas))) {
    const moved = reDetail(dropped, others, gesture, coastDetail);
    return { landmasses: [...others, ...moved], fraction: 1, merged: false };
  }
  const moved = dropped;

  if (policy === "merge") {
    // Exactly what the brush does on every stroke (S7 + S9), so identity follows ADR-10's
    // rule for free: the larger piece keeps the id and the name.
    const combined = unionLand(moved.map(landmassToPolygon), others.map(landmassToPolygon));
    const landmasses = splitByComponents(combined, [...others, ...moved]);
    return { landmasses, fraction: 1, merged: landmasses.length < others.length + moved.length };
  }

  if (policy === "carve") {
    const result = carve(moved, others, gap, coastDetail);
    if (result) return { ...result, fraction: 1, merged: false };
    // Refused. Fall through to sliding apart — the outcome that cannot lose work.
    const fallback = slideBack(snapshot, others, gesture, canvas);
    return {
      landmasses: [...others, ...at(snapshot, gesture, fallback)],
      fraction: fallback,
      merged: false,
      refused: true,
    };
  }

  const fraction = slideBack(snapshot, others, gesture, canvas);
  const resolved = reDetail(at(snapshot, gesture, fraction), others, gesture, coastDetail);
  return { landmasses: [...others, ...resolved], fraction, merged: false };
}
