import type { Landmass, Point, River } from "../scene/types";
import { pointInPolygon } from "./geometry/nesting";
import { closestOnSegment, halfWidthAt, riverCentreline } from "./river";
import { landmassToPolygon } from "./terrain/assemble";

/**
 * WP-29 (`13` §2, **ADR-39**) — a river's end finds the shore, or another river.
 *
 * Landing the last click exactly on a coastline is not possible at fit zoom, so every river
 * either stopped short — leaving a stub of land between the water and the sea — or overshot
 * into open water with a blunt end. Rivers draw *above* terrain (ADR-15), so neither failure
 * hid itself.
 *
 * **This module is pure geometry and knows nothing about the scene store**, so all of it is
 * unit-testable in Node. Nothing here is persisted: a snap resolves at draw time and writes
 * ordinary control points, which is why the package needs no `schemaVersion` bump and why a
 * snapped mouth stays draggable afterwards (D8).
 */

/**
 * How far past the coastline the mouth is pushed, in map units.
 *
 * **A knob, not a derivation** — it has to sit right against a coast stroke that is
 * screen-constant and a ring band whose gap is a user setting between 4 and 60, so no formula
 * owns it. 90 clears the widest band with room to spare; the number is the one that looked
 * right, and this comment is the design saying so rather than pretending otherwise.
 */
export const MOUTH_OVERSHOOT = 90;

/**
 * How far *inland* the approach point sits. Its only job is to give the tail a direction:
 * with both of the last two control points on the coast normal, the centreline arrives
 * perpendicular to the shore and the cap comes out parallel to it.
 */
export const MOUTH_APPROACH = 60;

export type SnapKind = "coast" | "river";

export interface Snap {
  kind: SnapKind;
  /** the point on the target itself — what "on the coast" means */
  at: Point;
  /** control points to write in place of the last one the user clicked */
  tail: Point[];
  distance: number;
}

interface Near {
  at: Point;
  distance: number;
  /** the segment the nearest point fell on, for its tangent */
  a: Point;
  b: Point;
  /** where along the target it landed, 0..1 — only meaningful for a river centreline */
  t: number;
}

const nearestOnPolyline = (line: Point[], p: Point, closed: boolean): Near | null => {
  if (line.length < 2) return null;
  let best: Near | null = null;
  const edges = closed ? line.length : line.length - 1;
  for (let i = 0; i < edges; i++) {
    const a = line[i];
    const b = line[(i + 1) % line.length];
    const at = closestOnSegment(p, a, b);
    const distance = Math.hypot(p[0] - at[0], p[1] - at[1]);
    if (!best || distance < best.distance) best = { at, distance, a, b, t: i / edges };
  }
  return best;
};

const unit = ([x, y]: Point): Point => {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
};

/**
 * The coast normal at `near`, pointing **out of the land**.
 *
 * Taken by testing rather than by winding order: a landmass's outer ring and its lake rings
 * wind opposite ways, and a rule that assumed one of them would put a river mouth inland on
 * the other. Two point-in-polygon tests, once, at the one segment that matters.
 */
const seawardNormal = (landmass: Landmass, near: Near): Point => {
  const tangent = unit([near.b[0] - near.a[0], near.b[1] - near.a[1]]);
  const normal: Point = [-tangent[1], tangent[0]];
  const polygon = landmassToPolygon(landmass);
  const probe: Point = [near.at[0] + normal[0], near.at[1] + normal[1]];
  return pointInPolygon(polygon, probe) ? [-normal[0], -normal[1]] : normal;
};

/**
 * Where a river's end should go, given everything it might reach.
 *
 * `radius` is in **map units** and the caller converts it from a screen distance, so the
 * snap feels the same at fit zoom and at 400% — the rule I8 applies to every other piece of
 * chrome. A fixed map-unit threshold would be unusable at one end of the range.
 *
 * **Nearest wins, with no preference for a type** (D9): "coast beats river" would be
 * unpredictable at the one place it ever fires, a tributary meeting a trunk near the shore.
 * A river never snaps to itself (D10) — `excludeId` covers the one being reshaped, and a
 * draft has no id yet.
 */
export function findSnap(
  end: Point,
  approach: Point,
  landmasses: Landmass[],
  rivers: River[],
  radius: number,
  excludeId?: string,
): Snap | null {
  let best: Snap | null = null;
  const keep = (snap: Snap) => {
    if (!best || snap.distance < best.distance) best = snap;
  };

  for (const landmass of landmasses) {
    for (const ring of [landmass.path, ...landmass.holes]) {
      const near = nearestOnPolyline(ring, end, true);
      if (!near || near.distance > radius) continue;
      const normal = seawardNormal(landmass, near);
      keep({
        kind: "coast",
        at: near.at,
        distance: near.distance,
        /**
         * Two points on the normal, replacing the one the user clicked. `riverCentreline` is
         * an open Chaikin, which pins the last point and leaves the final tangent along the
         * last segment — so a tail laid on the normal arrives perpendicular to the shore and
         * the cap comes out **parallel to the coast tangent**. The mouth opens along the
         * shore rather than being cut across the flow, and it costs two numbers.
         */
        tail: [
          [near.at[0] - normal[0] * MOUTH_APPROACH, near.at[1] - normal[1] * MOUTH_APPROACH],
          [near.at[0] + normal[0] * MOUTH_OVERSHOOT, near.at[1] + normal[1] * MOUTH_OVERSHOOT],
        ],
      });
    }
  }

  for (const river of rivers) {
    if (river.id === excludeId) continue;
    const line = riverCentreline(river.points);
    const near = nearestOnPolyline(line, end, false);
    if (!near || near.distance > radius) continue;
    /**
     * A tributary needs **no reshaping** — WP-8 already decided it. Rivers are flat, opaque
     * and unstroked, so two overlapping ribbons paint the same colour twice and a confluence
     * is seamless. All this end needs is to land *inside* the trunk rather than beside it,
     * so it carries on past the centreline by the trunk's local half-width and its cap is
     * buried under the trunk's own fill.
     *
     * It is not a join and nothing in the model says it is: deleting the trunk leaves the
     * tributary ending in open water, exactly as a deleted landmass leaves its river (D8).
     */
    const heading = unit([near.at[0] - approach[0], near.at[1] - approach[1]]);
    const bury = halfWidthAt(river, near.t);
    keep({
      kind: "river",
      at: near.at,
      distance: near.distance,
      tail: [[near.at[0] + heading[0] * bury, near.at[1] + heading[1] * bury]],
    });
  }

  return best;
}

/**
 * The river's points with its last one resolved against whatever it reached — or unchanged
 * when it reached nothing, in which case `riverRibbon`'s round cap makes it read as fading
 * out rather than sliced off (D6).
 *
 * The end **being laid** is the one that snaps, whichever it is (D6): you draw source to sea,
 * so the last point is normally the mouth, and nothing in the model knows which end is
 * downstream anyway.
 */
export function snapRiverEnd(
  points: Point[],
  landmasses: Landmass[],
  rivers: River[],
  radius: number,
  excludeId?: string,
): { points: Point[]; snap: Snap | null } {
  if (points.length < 2) return { points, snap: null };
  const end = points[points.length - 1];
  const approach = points[points.length - 2];
  const snap = findSnap(end, approach, landmasses, rivers, radius, excludeId);
  if (!snap) return { points, snap: null };
  return { points: [...points.slice(0, -1), ...snap.tail], snap };
}
