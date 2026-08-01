import type { Biome } from "../scene/types";

/**
 * Canvas colours, read from the `--map-*` custom properties in `styles/tokens.css`.
 *
 * ADR-24: one token set drives the Tailwind chrome and the map, so a single theme switch
 * recolours both. This module is the seam — nothing else in the renderer knows a colour
 * comes from CSS, because `refreshPalette()` writes the values back into these objects in
 * place and every draw reads them fresh.
 *
 * The literals below are the light theme, kept as real values rather than empty strings
 * for two reasons: they are the fallback when a property is missing, and `scene/bounds.ts`
 * and the sprite tests import this module in Node, where there is no document to read.
 */

export const PALETTE = {
  paper: "#EDE3C6",
  paperShade: "#C0AE84",
  sea: "#417A82",
  seaDeep: "#2C555C",
  ring: "#1E5147",
  ink: "#3A2E1F",
  coast: "#43341F",
  /**
   * Rivers are drawn **opaque**, unlike the sea, so that a tributary joining a main river
   * reads as one body of water. Any translucency stacks where two river objects overlap and
   * paints the confluence a darker colour than either river — at alpha 1 the second fill
   * lands on the identical colour and cannot show a seam. Same reason a river carries no
   * bank stroke: an outline would draw straight across the river it flows into.
   *
   * The value is `sea` at `SEA_OPACITY` pre-blended over land, so a lone river looks exactly
   * as it did while it was translucent.
   */
  river: "#85A296",
  /** Vignette ink as an unprefixed rgb triple — the draw builds both alpha stops from it. */
  vignette: "58 46 31",

  /* sprite artwork — baked into the raster cache, which `clearSpriteCache()` drops on a theme change */
  peak: "#B9AE93",
  peakLit: "#F2EFE6",
  tree: "#6F7F55",
  treeInk: "#3E4A2E",
  landmark: "#D8C9A4",
};

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
 *
 * Opacities are not themed: they are relationships between colours, and the dark tokens
 * already encode the shift. A themed alpha would double-apply it.
 */
export const SEA_OPACITY = 0.58;

/** Which custom property backs each entry. The map's colours are namespaced `--map-*`. */
const PALETTE_VARS: Record<keyof typeof PALETTE, string> = {
  paper: "--map-paper",
  paperShade: "--map-paper-shade",
  sea: "--map-sea",
  seaDeep: "--map-sea-deep",
  ring: "--map-ring",
  ink: "--map-ink",
  coast: "--map-coast",
  river: "--map-river",
  vignette: "--map-vignette",
  peak: "--map-peak",
  peakLit: "--map-peak-lit",
  tree: "--map-tree",
  treeInk: "--map-tree-ink",
  landmark: "--map-landmark",
};

const BIOME_VARS: Record<Biome, string> = {
  grassland: "--map-grassland",
  forest: "--map-forest",
  desert: "--map-desert",
  snow: "--map-snow",
  swamp: "--map-swamp",
};

/**
 * Re-read every colour from the document. Call after the theme changes — and note that
 * the caches built *from* these colours (`textures.ts`, `sprites/raster.ts`) have to be
 * dropped in the same breath, which is what `state/themeStore.ts` does.
 *
 * Writes in place rather than returning a new object: every renderer holds a reference to
 * these two, and swapping them would leave the old values drawn until each one re-imported.
 */
export function refreshPalette(): void {
  if (typeof document === "undefined") return;
  const style = getComputedStyle(document.documentElement);
  const read = (name: string) => style.getPropertyValue(name).trim();

  for (const [key, name] of Object.entries(PALETTE_VARS)) {
    const value = read(name);
    if (value) PALETTE[key as keyof typeof PALETTE] = value;
  }
  for (const [biome, name] of Object.entries(BIOME_VARS)) {
    const value = read(name);
    if (value) BIOME_FILL[biome as Biome] = value;
  }
}
