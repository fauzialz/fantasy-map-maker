import type { Biome } from "../scene/types";

/**
 * Canvas colours, mirroring the CSS custom properties in `06-frontend-styling.md`.
 *
 * ponytail: plain constants for now. The token system is meant to drive the canvas as
 * well as the DOM so one switch recolours everything — WP-13 replaces these with reads
 * of the CSS variables. Keeping them in one module is the seam that makes that a
 * one-file change.
 */
export const PALETTE = {
  paper: "#EDE3C6",
  paperShade: "#C0AE84",
  sea: "#417A82",
  seaDeep: "#2C555C",
  ring: "#1E5147",
  ink: "#3A2E1F",
  coast: "#43341F",
} as const;

/** Every biome needs a fill, or a landmass silently renders as a hole in the map. */
export const BIOME_FILL: Record<Biome, string> = {
  grassland: "#E4D8B0",
  forest: "#CBD0A2",
  desert: "#F0E0B4",
  snow: "#F2F2EA",
  swamp: "#C0C69C",
};

/** Land is slightly translucent so the parchment grain reads through it. */
export const LAND_OPACITY = 0.95;
/**
 * The sea is a wash over the paper, not a slab on top of it. Tuned by eye between two
 * failure modes: at 0.8 the tint buries the parchment and the map reads foggy; at 0.4
 * the sea sits so close to the paper in lightness that land and water stop separating.
 */
export const SEA_OPACITY = 0.58;
