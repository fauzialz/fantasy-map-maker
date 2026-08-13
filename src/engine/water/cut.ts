import polygonClipping from "polygon-clipping";
import type { Biome, Landmass, Water } from "../../scene/types";
import { fromIntMulti, toIntMulti } from "../geometry/coords";
import type { MultiPolygon, Polygon } from "../geometry/types";
import { landmassToPolygon } from "../terrain/assemble";

/**
 * WP-40 — **water is a substance, and the land is what is left of it** (ADR-47).
 *
 * The land is drawn as `union(landmass) − union(water)`, computed at draw time and never
 * stored. The landmass objects on disk are untouched: this is a stencil, not a cut. Lift the
 * stencil — delete the water object — and the land is whole again with no repair, which is
 * the same contract coastal rings already run under (`02` §7, "derived, never stored") with
 * a second ingredient.
 *
 * Because of that, a river's banks are ordinary coastline and its estuary is an ordinary
 * shore. Both defects `15-river-engine.md` recorded stop being *representable* rather than
 * being patched: there is no mouth for a coast stroke to cross, and a union has no trunk and
 * no tributary to be wider than.
 */

export const waterToPolygon = (water: Water): Polygon => [water.path, ...water.holes];

/**
 * The union of every water object.
 *
 * Unioned rather than passed through as a multipolygon because two overlapping water bodies
 * must subtract as one shape — differencing against them separately would leave the seam
 * between them stroked as a bank. C1 says they never overlap *at rest*, but the derivation
 * also runs mid-gesture, when they do.
 */
export function waterUnion(waters: Water[]): MultiPolygon {
  const polygons = waters.map(waterToPolygon).filter((polygon) => polygon[0]?.length >= 3);
  if (polygons.length === 0) return [];
  return fromIntMulti(polygonClipping.union(toIntMulti(polygons)));
}

/**
 * One landmass as it is actually drawn: its own shape, minus all the water.
 *
 * A `MultiPolygon` rather than a polygon because a river that crosses a landmass **severs
 * it** into two drawn pieces — while remaining one object, with one id, one biome and one
 * entry in the terrain layer. That is the whole point of deriving rather than storing: the
 * severed island is a picture, not an edit, and deleting the river restores the continent.
 */
export interface CutLandmass {
  id: string;
  biome: Biome;
  /** the landmass minus `union(water)`; empty when water covers it entirely */
  shape: MultiPolygon;
}

/**
 * The two-collection derivation, per landmass rather than over the union.
 *
 * `16` §3 states it as `union(land) − union(water)`, and per-landmass is **the same picture**:
 * C1/ADR-10 forbid one landmass overlapping another at rest, so the union adds no boundary
 * that differencing each landmass separately would miss. What it buys is everything the union
 * throws away — each piece keeps its `biome` to fill with and its `id` to be selected by,
 * neither of which survives a union of the whole terrain layer.
 *
 * The cost is N differences instead of one union plus one difference, and N is small: strokes
 * merge on overlap, so a hand-drawn map holds a handful of landmasses and a generated
 * archipelago tens.
 */
export function cutLand(landmasses: Landmass[], water: MultiPolygon): CutLandmass[] {
  const clip = water.length > 0 ? toIntMulti(water) : null;
  return landmasses.map((landmass) => {
    const polygon = landmassToPolygon(landmass);
    const base: MultiPolygon = [polygon];
    return {
      id: landmass.id,
      biome: landmass.biome,
      shape: clip === null
        ? base
        : fromIntMulti(polygonClipping.difference(toIntMulti(base), clip)),
    };
  });
}

/**
 * The **cut boundary** — the coastline as drawn, which is what the coastal bands offset from
 * (D5). One shape rather than the per-landmass pieces above, because bands between two close
 * islands have to merge into one shared band rather than collide (the strait fixture), and
 * that only happens if they grow from a single union.
 */
export function cutUnion(land: MultiPolygon, water: MultiPolygon): MultiPolygon {
  if (land.length === 0 || water.length === 0) return land;
  return fromIntMulti(polygonClipping.difference(toIntMulti(land), toIntMulti(water)));
}
