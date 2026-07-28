import type { Biome, Landmass } from "../../scene/types";
import { ringArea, signedArea, type Polygon, type Ring } from "../geometry/types";

/** Drop degenerate rings and collapse consecutive duplicate points. */
export function cleanRing(ring: Ring, tolerance = 1e-9): Ring {
  const out: Ring = [];
  for (const point of ring) {
    const last = out[out.length - 1];
    if (
      !last ||
      Math.abs(last[0] - point[0]) > tolerance ||
      Math.abs(last[1] - point[1]) > tolerance
    )
      out.push(point);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (
    out.length > 1 &&
    first &&
    last &&
    Math.abs(first[0] - last[0]) <= tolerance &&
    Math.abs(first[1] - last[1]) <= tolerance
  )
    out.pop();
  return out;
}

const wind = (ring: Ring, positive: boolean): Ring =>
  signedArea(ring) >= 0 === positive ? ring : [...ring].reverse();

/**
 * S6 — build a scene `landmass` from one traced component: outer ring plus holes, with
 * winding normalised (outer positive, holes negative) so even-odd fill renders lakes as
 * water instead of solid land.
 */
export function assembleLandmass(
  polygon: Polygon,
  biome: Biome = "grassland",
  id: string = crypto.randomUUID(),
): Landmass | null {
  const rings = polygon.map((ring) => cleanRing(ring)).filter((ring) => ring.length >= 3);
  if (rings.length === 0 || ringArea(rings[0]) === 0) return null;

  return {
    id,
    type: "landmass",
    path: wind(rings[0], true),
    holes: rings.slice(1).map((hole) => wind(hole, false)),
    biome,
  };
}

export const landmassToPolygon = (landmass: Landmass): Polygon => [
  landmass.path,
  ...landmass.holes,
];
