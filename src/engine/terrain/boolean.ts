import polygonClipping from "polygon-clipping";
import type { Biome, Landmass } from "../../scene/types";
import { fromIntMulti, toIntMulti } from "../geometry/coords";
import { polygonArea, type MultiPolygon } from "../geometry/types";
import { assembleLandmass, landmassToPolygon } from "./assemble";

/**
 * S7–S9 — the boolean engine. Every op converts to scaled ints on the way in and back
 * on the way out (see `coords.ts`); nothing outside this module touches scaled values.
 */

/** S7 — union new brush regions with overlapping land; detached regions stay separate. */
export function unionLand(newPolys: MultiPolygon, existingLand: MultiPolygon): MultiPolygon {
  if (newPolys.length === 0) return existingLand;
  if (existingLand.length === 0) return newPolys;
  return fromIntMulti(polygonClipping.union(toIntMulti(existingLand), toIntMulti(newPolys)));
}

/** S8 — subtract the sea/eraser region from land. May split a landmass or punch a lake. */
export function differenceLand(
  existingLand: MultiPolygon,
  eraseRegion: MultiPolygon,
): MultiPolygon {
  if (existingLand.length === 0 || eraseRegion.length === 0) return existingLand;
  return fromIntMulti(
    polygonClipping.difference(toIntMulti(existingLand), toIntMulti(eraseRegion)),
  );
}

const overlapArea = (a: MultiPolygon, b: MultiPolygon): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const hit = polygonClipping.intersection(toIntMulti(a), toIntMulti(b));
  return hit.reduce((total, polygon) => total + polygonArea(polygon), 0);
};

/**
 * S9 — one landmass object per disjoint polygon-with-holes, carrying identity across the
 * boolean op.
 *
 * ADR-10's rule is "the larger piece keeps the id/name". Applied both ways:
 * - **split** — each source claims the resulting piece it overlaps most; that piece keeps
 *   the id and name, every other piece gets a fresh id and no name.
 * - **merge** — when several sources land on one piece, the largest source's identity
 *   wins, matching "the larger piece keeps the id".
 *
 * The spec signature is `splitByComponents(polys)`; it takes the sources too, because
 * identity cannot be carried without knowing where the geometry came from.
 */
export function splitByComponents(
  polys: MultiPolygon,
  sources: Landmass[] = [],
  biome: Biome = "grassland",
): Landmass[] {
  const claims = new Map<number, Landmass>(); // result index → source that owns it

  for (const source of sources) {
    const sourcePolygon = [landmassToPolygon(source)];
    let bestIndex = -1;
    let bestOverlap = 0;
    polys.forEach((polygon, index) => {
      const overlap = overlapArea([polygon], sourcePolygon);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestIndex = index;
      }
    });
    if (bestIndex < 0) continue;

    // Merge: the bigger source keeps its identity.
    const incumbent = claims.get(bestIndex);
    if (
      !incumbent ||
      polygonArea(landmassToPolygon(source)) > polygonArea(landmassToPolygon(incumbent))
    )
      claims.set(bestIndex, source);
  }

  return polys
    .map((polygon, index) => {
      const owner = claims.get(index);
      const landmass = assembleLandmass(polygon, owner?.biome ?? biome, owner?.id);
      return landmass && owner?.name ? { ...landmass, name: owner.name } : landmass;
    })
    .filter((landmass): landmass is Landmass => landmass !== null);
}
