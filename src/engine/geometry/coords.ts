import { closeRing, openRing, type MultiPolygon, type Ring } from "./types";

/**
 * S5 — coordinate & precision conventions (`04-geometry-pipeline.md`).
 *
 * Boolean and offset libraries want integer coordinates. Everything in the app is
 * map-space floats; conversion to scaled ints happens **exactly once**, at the
 * boolean/offset boundary, and back exactly once after. Mixing scaled and unscaled
 * coordinates is the #1 source of silent geometry bugs, so nothing else may scale.
 */
export const SCALE = 100; // 2 decimal places of sub-pixel precision
export const TOL = 1 / SCALE;

/** Mask pixels per map unit. Fixed, so coastline quality never depends on zoom. */
export const MASK_RESOLUTION = 0.5;

export const maskToMapRing = (ring: Ring, resolution = MASK_RESOLUTION): Ring =>
  ring.map(([x, y]) => [x / resolution, y / resolution]);

export const toIntRing = (ring: Ring): Ring =>
  ring.map(([x, y]) => [Math.round(x * SCALE), Math.round(y * SCALE)]);

export const fromIntRing = (ring: Ring): Ring => ring.map(([x, y]) => [x / SCALE, y / SCALE]);

/** Map-space open rings → scaled-int closed rings, ready for polygon-clipping. */
export const toIntMulti = (multi: MultiPolygon): MultiPolygon =>
  multi.map((polygon) => polygon.map((ring) => closeRing(toIntRing(ring))));

/** polygon-clipping output → map-space open rings. */
export const fromIntMulti = (multi: MultiPolygon): MultiPolygon =>
  multi.map((polygon) => polygon.map((ring) => openRing(fromIntRing(ring))));
