import type { Landmass, Mountain, Tree, WorldType } from "../../scene/types";
import { MASK_RESOLUTION } from "../geometry/coords";
import { polygonArea } from "../geometry/types";
import { landmassToPolygon } from "../terrain/assemble";
import { createMask, type Mask } from "../terrain/mask";
import { terrainCommit } from "../terrain/pipeline";
import { assignBiomes } from "./biome";
import {
  generateFields,
  mulberry32,
  quantile,
  sampleField,
  type Field,
  type Fields,
} from "./fields";
import { capToBudget, scatterForests, scatterMountains } from "./scatter";

/**
 * Pipeline B — noise to a populated world (system design §10, ADR-21).
 *
 * The terrain half is not reimplemented: the noise produces a mask and the mask goes
 * through the **same commit path as the brush** (S2–S9), so a generated coastline is the
 * same kind of object a painted one is, and rings come out of Pipeline C for free.
 */

/** Islands smaller than this fraction of the canvas are noise, not geography. */
const MIN_ISLAND_FRACTION = 0.0006;
/** Total scattered objects a generated world may hand back (ADR-20's 1–2k budget). */
export const OBJECT_BUDGET = 1400;

export interface GenerateRequest {
  canvas: { w: number; h: number };
  seed: number;
  landAmount: number;
  roughness: number;
  worldType: WorldType;
  /** advanced override in 0..1; null derives the level from `landAmount` */
  seaLevel: number | null;
  mountainDensity: number;
  forestDensity: number;
  /** rotation spread in degrees for scattered sprites (`12` D4) */
  rotation: number;
  coastDetail: number;
}

export interface GenerateResult {
  landmasses: Landmass[];
  mountains: Mountain[];
  trees: Tree[];
}

/** 10b — threshold the elevation field into the binary land mask Pipeline A expects. */
export function landMask(
  elevation: Field,
  seaLevel: number,
  canvas: { w: number; h: number },
): Mask {
  const mask = createMask(
    Math.ceil(canvas.w * MASK_RESOLUTION),
    Math.ceil(canvas.h * MASK_RESOLUTION),
  );
  for (let y = 0; y < mask.h; y++) {
    const v = y / (mask.h - 1);
    for (let x = 0; x < mask.w; x++) {
      if (sampleField(elevation, x / (mask.w - 1), v) > seaLevel) mask.data[y * mask.w + x] = 1;
    }
  }
  return mask;
}

/** 10c — drop the specks the threshold left behind. */
export const dropSpecks = (landmasses: Landmass[], minArea: number): Landmass[] =>
  landmasses.filter((landmass) => polygonArea(landmassToPolygon(landmass)) >= minArea);

/** The sea level a request works out to, exposed so scatter and tests agree with terrain. */
export const seaLevelFor = (fields: Fields, request: GenerateRequest): number =>
  request.seaLevel ?? quantile(fields.elevation, 1 - request.landAmount);

/** The top of this particular world: a near-max, so one freak cell can't define the peaks. */
export const peakFor = (fields: Fields): number => quantile(fields.elevation, 0.995);

export function generateWorld(request: GenerateRequest): GenerateResult {
  const { canvas, coastDetail, seed } = request;
  const fields = generateFields({
    seed,
    roughness: request.roughness,
    worldType: request.worldType,
    canvas,
  });
  const seaLevel = seaLevelFor(fields, request);

  // 10b — the mask goes through Pipeline A unchanged: contours → chaikin → simplify →
  // assemble → split.
  const traced = terrainCommit({
    mask: landMask(fields.elevation, seaLevel, canvas),
    maskResolution: MASK_RESOLUTION,
    coastDetail,
    mode: "paint",
    existingLand: [],
  });

  const landmasses = assignBiomes(
    dropSpecks(traced, canvas.w * canvas.h * MIN_ISLAND_FRACTION),
    fields,
    canvas,
  );

  // Scatter draws from one stream seeded off the world seed, so the same seed places the
  // same trees on the same hills.
  const rng = mulberry32(seed ^ 0x5f3759df);
  const context = {
    fields,
    canvas,
    landmasses,
    seaLevel,
    peak: peakFor(fields),
    rotation: request.rotation,
    rng,
  };
  const { mountains, trees } = capToBudget(
    scatterMountains(context, request.mountainDensity),
    scatterForests(context, request.forestDensity),
    OBJECT_BUDGET,
  );

  return { landmasses, mountains, trees };
}
