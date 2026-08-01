import type { Biome, Landmass } from "../../scene/types";
import { maskToMapRing } from "../geometry/coords";
import type { MultiPolygon } from "../geometry/types";
import { landmassToPolygon } from "./assemble";
import { differenceLand, splitByComponents, unionLand } from "./boolean";
import { maskToContours } from "./contours";
import { isMaskEmpty, type Mask } from "./mask";
import { chaikin, simplify } from "./smooth";

export interface TerrainCommit {
  mask: Mask;
  /** map units per mask pixel is fixed; see MASK_RESOLUTION */
  maskResolution: number;
  coastDetail: number;
  /** paint unions with land (S7); erase subtracts from it (S8) */
  mode: "paint" | "erase";
  existingLand: Landmass[];
  /** biome for land this stroke creates; existing landmasses keep their own (D6) */
  biome?: Biome;
}

/**
 * Pipeline A — one brush stroke, committed.
 *
 *   S2 contours → S5 mask→map → S3 chaikin → S4 simplify → S7 union / S8 difference
 *   → S9 split (which applies S6 assemble to each surviving component)
 *
 * Two ordering notes against `04-geometry-pipeline.md`:
 * - mask→map-space runs *before* smoothing, because the S4 epsilon is specified in
 *   map-space units; smoothing in pixel space would scale it by the mask resolution.
 * - the scaled-int conversion still happens exactly once, inside the boolean ops.
 */
export function terrainCommit({
  mask,
  maskResolution,
  coastDetail,
  mode,
  existingLand,
  biome,
}: TerrainCommit): Landmass[] {
  if (isMaskEmpty(mask)) return existingLand;

  const regions: MultiPolygon = maskToContours(mask)
    .map((polygon) =>
      polygon
        .map((ring) => simplify(chaikin(maskToMapRing(ring, maskResolution)), coastDetail))
        .filter((ring) => ring.length >= 3),
    )
    .filter((polygon) => polygon.length > 0);

  if (regions.length === 0) return existingLand;

  const existing = existingLand.map(landmassToPolygon);
  const combined =
    mode === "erase" ? differenceLand(existing, regions) : unionLand(regions, existing);

  return splitByComponents(combined, existingLand, biome);
}
