import Offset from "polygon-offset";
import polygonClipping from "polygon-clipping";
import type { Landmass } from "../../scene/types";
import { fromIntMulti, toIntMulti, SCALE } from "../geometry/coords";
import { groupRingsByNesting } from "../geometry/nesting";
import type { MultiPolygon, Rect, Ring } from "../geometry/types";
import { landmassToPolygon } from "../terrain/assemble";

/**
 * S10–S14 — coastal rings (ADR-13). Rings are **derived, never stored**: they come from
 * the union of ALL land, buffered outward and clipped to water.
 *
 * Two wins fall out of using the union rather than per-landmass offsets:
 * 1. growing the union expands the coast into the ocean *and* shrinks lake holes, so
 *    ocean rings and lake rings come from one operation;
 * 2. bands between two close islands merge into one shared band instead of colliding —
 *    the strait fixture is exactly this.
 */

/** Round-join tessellation for the offset (the spec pins JoinType=Round). */
const ARC_SEGMENTS = 8;

/** S10 — union of every landmass, holes included. */
export function landUnion(landmasses: Landmass[]): MultiPolygon {
  const polygons = landmasses.map(landmassToPolygon).filter((polygon) => polygon.length > 0);
  if (polygons.length === 0) return [];
  return fromIntMulti(polygonClipping.union(toIntMulti(polygons)));
}

/** S11 — canvas minus land. Lakes (holes) and the open sea are both water. */
export function waterRegion(canvas: Rect, land: MultiPolygon): MultiPolygon {
  const rect: MultiPolygon = [
    [
      [
        [canvas.x, canvas.y],
        [canvas.x + canvas.w, canvas.y],
        [canvas.x + canvas.w, canvas.y + canvas.h],
        [canvas.x, canvas.y + canvas.h],
      ],
    ],
  ];
  if (land.length === 0) return rect;
  return fromIntMulti(polygonClipping.difference(toIntMulti(rect), toIntMulti(land)));
}

/**
 * S12 — grow land outward by `distance`, with round joins.
 *
 * polygon-offset returns a flat list of rings with inverted winding, so the result is
 * regrouped by containment and normalised through a union before anyone sees it.
 */
export function offsetGrow(land: MultiPolygon, distance: number): MultiPolygon {
  if (land.length === 0) return [];
  if (distance <= 0) return land;

  const scaled = toIntMulti(land);
  const rings = new Offset()
    .data(scaled as unknown as number[][][])
    .arcSegments(ARC_SEGMENTS)
    .margin(distance * SCALE) as unknown as Ring[];

  const grouped = groupRingsByNesting(rings);
  if (grouped.length === 0) return land;
  return fromIntMulti(polygonClipping.union(grouped));
}

/**
 * S13 — concentric bands. band(i) = grow(i·gap) − grow((i−1)·gap); band 1 uses the land
 * union itself as its inner boundary, so the first ring hugs the coast.
 */
export function ringBands(land: MultiPolygon, ringCount: number, ringGap: number): MultiPolygon[] {
  if (land.length === 0 || ringCount < 1 || ringGap <= 0) return [];

  const bands: MultiPolygon[] = [];
  let inner = land;
  for (let i = 1; i <= ringCount; i++) {
    const outer = offsetGrow(land, i * ringGap);
    if (outer.length === 0) break;
    bands.push(fromIntMulti(polygonClipping.difference(toIntMulti(outer), toIntMulti(inner))));
    inner = outer;
  }
  return bands;
}

/** S14 — clip each band to water, so rings never cover land or another island. */
export function clipRings(bands: MultiPolygon[], water: MultiPolygon): MultiPolygon[] {
  if (water.length === 0) return bands.map(() => []);
  const clip = toIntMulti(water);
  return bands.map((band) =>
    band.length === 0 ? [] : fromIntMulti(polygonClipping.intersection(toIntMulti(band), clip)),
  );
}

export interface DeriveRings {
  landmasses: Landmass[];
  canvas: Rect;
  ringCount: number;
  ringGap: number;
}

/** Pipeline C — S10 → S11 → S13 → S14. */
export function deriveRings({
  landmasses,
  canvas,
  ringCount,
  ringGap,
}: DeriveRings): MultiPolygon[] {
  const land = landUnion(landmasses);
  if (land.length === 0) return [];
  return clipRings(ringBands(land, ringCount, ringGap), waterRegion(canvas, land));
}
