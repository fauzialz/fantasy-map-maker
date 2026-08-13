import type { Biome, Landmass, Water } from "../../scene/types";
import { maskToMapRing } from "../geometry/coords";
import { multiPolygonArea, type MultiPolygon } from "../geometry/types";
import { splitWaterComponents } from "../water/commit";
import { waterToPolygon } from "../water/cut";
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
  /**
   * WP-42 — the water the stroke may cut through (D18, ADR-49). Painted land subtracts from
   * it **destructively**, in the same round-trip, because a stroke that grows land and shrinks
   * water is one edit and has to be one undo step.
   */
  existingWater?: Water[];
}

export interface TerrainCommitResult {
  landmasses: Landmass[];
  /**
   * The new water collection, or **null when the stroke did not touch any** — which is every
   * stroke on a map with no rivers, and most strokes on a map with them.
   *
   * Null rather than the input echoed back, because the reply crosses a `postMessage` and
   * arrives as a copy: handing back an equal-but-new array would rewrite the water layer on
   * every land stroke, put it in the undo diff, and invalidate a derivation that had no reason
   * to re-run.
   */
  waters: Water[] | null;
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
 *
 * **Since WP-42 it can return two collections**, because painting land carves the water it
 * crosses (D18). The asymmetry is required rather than an oversight: water subtracts from land
 * *non-destructively* at draw time, so if land also subtracted from water non-destructively the
 * two would define each other in a circle (C8). One direction has to be destructive, and this
 * is it — the only way back from painting land across a river is undo.
 */
export function terrainCommit({
  mask,
  maskResolution,
  coastDetail,
  mode,
  existingLand,
  biome,
  existingWater = [],
}: TerrainCommit): TerrainCommitResult {
  if (isMaskEmpty(mask)) return { landmasses: existingLand, waters: null };

  const regions: MultiPolygon = maskToContours(mask)
    .map((polygon) =>
      polygon
        .map((ring) => simplify(chaikin(maskToMapRing(ring, maskResolution)), coastDetail))
        .filter((ring) => ring.length >= 3),
    )
    .filter((polygon) => polygon.length > 0);

  if (regions.length === 0) return { landmasses: existingLand, waters: null };

  const existing = existingLand.map(landmassToPolygon);
  const combined =
    mode === "erase" ? differenceLand(existing, regions) : unionLand(regions, existing);

  return {
    landmasses: splitByComponents(combined, existingLand, biome),
    waters: mode === "paint" ? carveWater(existingWater, regions) : null,
  };
}

/**
 * WP-42 — the stroke subtracted from every water object it crosses, then re-split.
 *
 * The re-split is what makes this more than a subtraction: painting land across a river
 * **severs it into two water objects**, the mirror of the sea brush cutting a landmass in two.
 * That is also the only way to remove *part* of a water body, since merging is eager (D10) and
 * the eraser takes objects whole — which is exactly why D18 gave the job to this brush.
 *
 * Returns null when nothing was touched, so a stroke in open country costs the water layer
 * nothing at all.
 */
function carveWater(existingWater: Water[], regions: MultiPolygon): Water[] | null {
  if (existingWater.length === 0) return null;

  const before = existingWater.map(waterToPolygon);
  const carved = differenceLand(before, regions);
  const after = splitWaterComponents(carved, existingWater);

  /**
   * **Area, not counts.** The first version of this asked whether the object count or the
   * vertex count had changed, and a fixture caught it: shaving one bank of a rectangular river
   * along its whole length leaves a rectangle — same one object, same four points, and a real
   * carve reported as a miss. Any subtraction that removes geometry removes *area*, and a miss
   * removes exactly none, so this is the question with no false negative in it.
   *
   * Relative epsilon because the difference round-trips through scaled ints (`coords.ts`), so
   * an untouched polygon comes back with float noise rather than byte equality.
   */
  const wasArea = multiPolygonArea(before);
  if (wasArea > 0 && Math.abs(multiPolygonArea(carved) - wasArea) < wasArea * 1e-9) return null;

  return after;
}
