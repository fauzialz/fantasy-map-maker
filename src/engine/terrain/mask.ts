import type { Point } from "../geometry/types";

/**
 * S1 — the raster scratch layer the terrain brush paints into (ADR-09: the terrain layer
 * is a raster↔vector hybrid — raster while dragging, vectorised on commit). One byte per
 * pixel, 0 or 1, at a fixed internal resolution so coastline quality never changes with
 * zoom. Overlapping stamps union for free.
 */
export interface Mask {
  w: number;
  h: number;
  data: Uint8Array;
}

export const createMask = (w: number, h: number): Mask => ({
  w,
  h,
  data: new Uint8Array(w * h),
});

function fillDisc(mask: Mask, cx: number, cy: number, r: number, value: 0 | 1): void {
  const r2 = r * r;
  const x0 = Math.max(0, Math.floor(cx - r));
  const x1 = Math.min(mask.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const y1 = Math.min(mask.h - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const row = y * mask.w;
    for (let x = x0; x <= x1; x++) {
      const dx = x - cx;
      if (dx * dx + dy * dy <= r2) mask.data[row + x] = value;
    }
  }
}

/**
 * Stamp a filled-circle brush from the previous pointer sample to the current one.
 * Samples are interpolated at ≤ radius spacing so a fast drag leaves no gaps.
 *
 * ponytail: mutates and returns the same mask. This runs on every pointermove over a
 * multi-megabyte buffer — copying it per sample would be the one unaffordable purity.
 */
export function stampMask(
  mask: Mask,
  from: Point,
  to: Point,
  brushSize: number,
  value: 0 | 1 = 1,
): Mask {
  const radius = brushSize / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const distance = Math.hypot(dx, dy);
  // Spacing of r leaves a ~0.13r scallop between stamps, which survives smoothing and
  // reads as beading along the coast. Half that spacing drops it to ~0.03r for one extra
  // fill per sample — still inside the spec's "≤ brushSize/2".
  const steps = Math.max(1, Math.ceil(distance / Math.max(radius / 2, 0.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillDisc(mask, from[0] + dx * t, from[1] + dy * t, radius, value);
  }
  return mask;
}

/** Painted pixel count — used by fixtures and to skip empty commits. */
export function maskArea(mask: Mask): number {
  let count = 0;
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i]) count++;
  return count;
}

export const isMaskEmpty = (mask: Mask): boolean => !mask.data.some((v) => v !== 0);
