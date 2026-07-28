import { contours } from "d3-contour";
import { openRing, signedArea, type MultiPolygon, type Ring } from "../geometry/types";
import type { Mask } from "./mask";

/**
 * S2 — trace a binary mask into rings, grouped one entry per connected component, each
 * with its outer ring and any hole rings (lakes).
 *
 * The pipeline spec pins the `marching-squares` package, but that package is AGPL-3.0,
 * which would force the whole app and the planned @byfauzi/* packages under AGPL.
 * `d3-contour` (ISC) runs the same marching-squares algorithm and already assembles
 * rings into polygons-with-holes, which is exactly this stage's output.
 */
export function maskToContours(mask: Mask): MultiPolygon {
  const values = Array.from(mask.data, Number);
  const [geometry] = contours().size([mask.w, mask.h]).thresholds([0.5])(values);
  if (!geometry) return [];

  return geometry.coordinates
    .map((polygon) =>
      polygon.map((ring) => openRing(ring as Ring)).filter((ring) => ring.length >= 3),
    )
    .filter((polygon) => polygon.length > 0 && Math.abs(signedArea(polygon[0])) > 0);
}
