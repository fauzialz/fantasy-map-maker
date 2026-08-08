import type { GeneratorMeta, WorldType } from "../../scene/types";

/**
 * The world code — `11-editor-shell.md` §5.3.
 *
 * Generation is deterministic from a seed, but the seed is only four of the nine inputs
 * `generateWorld` reads, and three of the rest (`seaLevel`, `mountainDensity`,
 * `forestDensity`) are session-only editor state deliberately outside the scene schema.
 * A bare copyable seed would therefore reproduce nothing whenever another knob differed,
 * and would look broken rather than under-specified. So the shareable unit is every input
 * that decides the world, in one string.
 *
 * **Canvas size and `coastDetail` are deliberately out.** They belong to your map rather
 * than to the world recipe — a code should not resize someone's canvas — and leaving them
 * out is what lets WP-30's create page pick a canvas first and then accept a code for
 * everything else.
 *
 * Human-readable on purpose: no base64, no JSON. Someone can see their seed in it, and a
 * code mangled by a chat client is diagnosable by eye.
 */

export interface WorldInputs extends GeneratorMeta {
  /** `null` = derived from `landAmount` as a quantile, which is the default */
  seaLevel: number | null;
  mountainDensity: number;
  forestDensity: number;
}

const VERSION = "w1";
const WORLD_TYPES: WorldType[] = ["single", "archipelago", "multiple"];
const AUTO = "auto";

/**
 * `w1-483920104-0.40-0.60-single-auto-0.50-0.50`
 *      seed      land  rough  type   sea  mtn  forest
 *
 * Fixed order and dash-joined behind a version tag. Two decimals everywhere, so a slider
 * value carrying float drift (0.30000000000000004) round-trips to the step it was on.
 */
export const formatWorldCode = (w: WorldInputs): string =>
  [
    VERSION,
    w.seed,
    w.landAmount.toFixed(2),
    w.roughness.toFixed(2),
    w.worldType,
    w.seaLevel === null ? AUTO : w.seaLevel.toFixed(2),
    w.mountainDensity.toFixed(2),
    w.forestDensity.toFixed(2),
  ].join("-");

/** In range and finite, or nothing. The bounds are the dialog's own slider bounds — a value
 *  outside them could not be shown on the control it sets, which is the whole promise. */
const num = (text: string, min: number, max: number): number | null => {
  const value = Number(text);
  return text !== "" && Number.isFinite(value) && value >= min && value <= max ? value : null;
};

/**
 * Rejects rather than repairs — ADR-30's parser rule, which exists because a silent-fallback
 * parser cost a day. A wrong version, a wrong field count, a value out of range or a
 * misspelled world type all return `null` and change nothing.
 *
 * `null` rather than a throw because this is a *user input* boundary: someone pasting a
 * mangled code has made a typo, not a programming error, and the caller's answer is a toast.
 * The registry parser throws because an unsupported path command there is a bug in our data.
 *
 * The seed is a non-negative integer, so no field can carry a minus sign and splitting on
 * `-` is unambiguous.
 */
export function parseWorldCode(code: string): WorldInputs | null {
  const parts = code.trim().toLowerCase().split("-");
  if (parts.length !== 8 || parts[0] !== VERSION) return null;
  const [, seedText, land, rough, type, sea, mountain, forest] = parts;

  const seed = num(seedText, 0, Number.MAX_SAFE_INTEGER);
  const landAmount = num(land, 0.1, 0.9);
  const roughness = num(rough, 0, 1);
  const seaLevel = sea === AUTO ? null : num(sea, 0.05, 0.95);
  const mountainDensity = num(mountain, 0, 1);
  const forestDensity = num(forest, 0, 1);

  if (seed === null || !Number.isInteger(seed)) return null;
  if (landAmount === null || roughness === null) return null;
  if (sea !== AUTO && seaLevel === null) return null;
  if (mountainDensity === null || forestDensity === null) return null;
  if (!WORLD_TYPES.includes(type as WorldType)) return null;

  return {
    seed,
    landAmount,
    roughness,
    worldType: type as WorldType,
    seaLevel,
    mountainDensity,
    forestDensity,
  };
}
