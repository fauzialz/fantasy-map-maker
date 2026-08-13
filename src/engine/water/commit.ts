import type { Water } from "../../scene/types";
import { maskToMapRing } from "../geometry/coords";
import { ringArea, signedArea, type MultiPolygon, type Ring } from "../geometry/types";
import { cleanRing } from "../terrain/assemble";
import { claimComponents, unionLand } from "../terrain/boolean";
import { maskToContours } from "../terrain/contours";
import { isMaskEmpty, type Mask } from "../terrain/mask";
import { chaikin, simplify } from "../terrain/smooth";
import { waterToPolygon, waterUnion } from "./cut";

/**
 * WP-41 — one water stroke, committed. **Pipeline A, pointed at the other collection.**
 *
 * It is the landmass brush's path verbatim — contours → map space → chaikin → simplify at
 * `coastDetail` → union → connected components — and that is the design rather than reuse for
 * its own sake (`16` §5). Water strokes merge on overlap exactly as land strokes do (D10),
 * carry identity by ADR-10's larger-piece rule, and are simplified at the same setting, so a
 * bank cannot be smoother or rougher than the coastline it is cut from.
 *
 * There is no `mode` here. Carving *land* is the terrain pipeline's erase branch, unchanged;
 * this is only the laying half.
 */

export interface WaterCommit {
  mask: Mask;
  /** map units per mask pixel is fixed; see MASK_RESOLUTION */
  maskResolution: number;
  coastDetail: number;
  existingWater: Water[];
}

const wind = (ring: Ring, positive: boolean): Ring =>
  signedArea(ring) >= 0 === positive ? ring : [...ring].reverse();

/**
 * S6 for water: one object per disjoint polygon-with-holes, wound so even-odd fill reads an
 * island inside a lake as land rather than water — the same convention `assembleLandmass`
 * applies, because the derivation differences the two against each other and a ring wound the
 * wrong way would subtract the wrong side.
 */
const assembleWater = (
  polygon: MultiPolygon[number],
  id: string = crypto.randomUUID(),
): Water | null => {
  const rings = polygon.map((ring) => cleanRing(ring)).filter((ring) => ring.length >= 3);
  if (rings.length === 0 || ringArea(rings[0]) === 0) return null;
  return {
    id,
    type: "water",
    path: wind(rings[0], true),
    holes: rings.slice(1).map((hole) => wind(hole, false)),
  };
};

export function waterCommit({
  mask,
  maskResolution,
  coastDetail,
  existingWater,
}: WaterCommit): Water[] {
  if (isMaskEmpty(mask)) return existingWater;

  const regions: MultiPolygon = maskToContours(mask)
    .map((polygon) =>
      polygon
        .map((ring) => simplify(chaikin(maskToMapRing(ring, maskResolution)), coastDetail))
        .filter((ring) => ring.length >= 3),
    )
    .filter((polygon) => polygon.length > 0);

  if (regions.length === 0) return existingWater;

  return splitWaterComponents(unionLand(regions, existingWater.map(waterToPolygon)), existingWater);
}

/**
 * The connected components of a water collection, with identity carried across.
 *
 * Exported because a **drag** has to run it too, not just a stroke: C1 says water never
 * overlaps water *at rest*, and dropping one body onto another is as much a commit as painting
 * across it. Land answers the same question through `resolveDrop` in the worker, which also
 * carries an overlap policy and a slide-back; water has neither — D10 says water simply merges,
 * so the whole answer is a union and a re-split.
 */
export function splitWaterComponents(polys: MultiPolygon, sources: Water[] = []): Water[] {
  const claims = claimComponents(polys, sources, waterToPolygon);
  return polys
    .map((polygon, index) => assembleWater(polygon, claims.get(index)?.id))
    .filter((water): water is Water => water !== null);
}

/**
 * WP-43 — a spline-generated ribbon joins the collection, merging like any other water (D10).
 *
 * **Not simplified at `coastDetail`**, unlike a brushed stroke, and that is deliberate: the
 * ribbon's banks are already the shape the tool meant to draw, and running Douglas–Peucker over
 * them would strip out exactly the wander the roughness setting exists to create. A brush stroke
 * needs simplifying because it arrives as a traced raster mask; this arrives as geometry.
 *
 * From here it is indistinguishable from a painted channel (C9) — same fields, same selection,
 * same carving, same merge.
 */
export function layRibbon(existingWater: Water[], ribbon: Ring): Water[] {
  if (ribbon.length < 3) return existingWater;
  return splitWaterComponents(
    unionLand([[ribbon]], existingWater.map(waterToPolygon)),
    existingWater,
  );
}

/**
 * Union a water collection with itself and re-split it — C1 restored after a drag (D10).
 *
 * `waterUnion` rather than `unionLand`, and the difference matters: `unionLand` short-circuits
 * when one side is empty, so passing a collection as "new" against nothing existing hands it
 * straight back **un-unioned**. That is correct for a brush stroke, whose contours are disjoint
 * by construction, and silently wrong here, where overlapping is the entire question.
 */
export const mergeWater = (waters: Water[]): Water[] =>
  waters.length < 2 ? waters : splitWaterComponents(waterUnion(waters), waters);
