import { createNoise2D } from "simplex-noise";
import type { WorldType } from "../../scene/types";

/**
 * 10a — the noise fields the whole generator reads from: elevation, moisture and a
 * latitude/temperature gradient, sampled on a coarse grid and interpolated on demand.
 *
 * The grid is deliberately coarser than the terrain mask (one cell per `FIELD_CELL` map
 * units): coastline detail comes from the octave sum and then from the coast-detail
 * simplify, not from sampling noise three million times.
 */

/** Scalar field over the canvas, row-major, values normalised to 0..1. */
export interface Field {
  w: number;
  h: number;
  data: Float32Array;
}

export interface Fields {
  elevation: Field;
  moisture: Field;
  /** 1 at the equator, 0 at the poles, minus a penalty for altitude */
  temperature: Field;
}

export interface FieldParams {
  seed: number;
  /** 0 = smooth and rolling, 1 = noisy and detailed */
  roughness: number;
  worldType: WorldType;
  canvas: { w: number; h: number };
}

/** Map units per field cell. */
export const FIELD_CELL = 10;

/**
 * World shape enters as a low-frequency bias, per ADR-21: base frequency decides how many
 * landmasses the noise wants to make, the radial falloff decides how much of the canvas
 * edge it is allowed to reach.
 */
const WORLD: Record<WorldType, { frequency: number; falloff: number }> = {
  single: { frequency: 1.6, falloff: 0.85 },
  multiple: { frequency: 2.6, falloff: 0.5 },
  archipelago: { frequency: 4.5, falloff: 0.35 },
};

/**
 * A seeded PRNG, because `simplex-noise` takes one but ships none, and `Math.random` is
 * not reproducible — the same seed has to give the same world (ADR-21).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fractal sum of octaves, in -1..1. `roughness` drives both how many and how loud. */
function fbm(
  noise: (x: number, y: number) => number,
  x: number,
  y: number,
  octaves: number,
  persistence: number,
): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * frequency, y * frequency) * amplitude;
    total += amplitude;
    amplitude *= persistence;
    frequency *= 2;
  }
  return sum / total;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function generateFields({ seed, roughness, worldType, canvas }: FieldParams): Fields {
  const w = Math.max(2, Math.round(canvas.w / FIELD_CELL));
  const h = Math.max(2, Math.round(canvas.h / FIELD_CELL));
  const { frequency, falloff } = WORLD[worldType];

  const octaves = 3 + Math.round(roughness * 3);
  const persistence = 0.4 + roughness * 0.3;
  const elevationNoise = createNoise2D(mulberry32(seed));
  const moistureNoise = createNoise2D(mulberry32(seed ^ 0x9e3779b9));

  const elevation = { w, h, data: new Float32Array(w * h) };
  const moisture = { w, h, data: new Float32Array(w * h) };
  const temperature = { w, h, data: new Float32Array(w * h) };

  for (let y = 0; y < h; y++) {
    const v = y / (h - 1);
    // 1 at the equator, 0 at either pole.
    const latitude = 1 - Math.abs(2 * v - 1);
    for (let x = 0; x < w; x++) {
      const u = x / (w - 1);
      const i = y * w + x;

      // Elliptical distance from the centre: 0 in the middle, 1 at a corner.
      const radius = Math.hypot(2 * u - 1, 2 * v - 1) / Math.SQRT2;
      const shaped =
        clamp01((fbm(elevationNoise, u * frequency, v * frequency, octaves, persistence) + 1) / 2) *
        (1 - falloff * radius * radius);

      elevation.data[i] = shaped;
      moisture.data[i] = clamp01(
        (fbm(moistureNoise, u * frequency * 0.7, v * frequency * 0.7, 3, 0.5) + 1) / 2,
      );
      // Height cools a place down; that is what puts snow on the peaks and not just at
      // the poles.
      temperature.data[i] = clamp01(latitude - Math.max(0, shaped - 0.5) * 0.8);
    }
  }

  return { elevation, moisture, temperature };
}

/** Bilinear sample at normalised coordinates; `u`/`v` outside 0..1 clamp to the edge. */
export function sampleField(field: Field, u: number, v: number): number {
  const fx = clamp01(u) * (field.w - 1);
  const fy = clamp01(v) * (field.h - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, field.w - 1);
  const y1 = Math.min(y0 + 1, field.h - 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const top = field.data[y0 * field.w + x0] * (1 - tx) + field.data[y0 * field.w + x1] * tx;
  const bottom = field.data[y1 * field.w + x0] * (1 - tx) + field.data[y1 * field.w + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}

/**
 * The value that `fraction` of the field's cells fall below — how "land amount 0.45" turns
 * into a sea level that actually leaves 45% of the canvas above water, whatever shape the
 * noise happened to take. A 512-bin histogram is exact to ~0.2% of the range, which is
 * finer than the slider.
 */
export function quantile(field: Field, fraction: number): number {
  const bins = 512;
  const histogram = new Int32Array(bins);
  for (let i = 0; i < field.data.length; i++) {
    histogram[Math.min(bins - 1, Math.max(0, Math.floor(field.data[i] * bins)))]++;
  }

  const target = clamp01(fraction) * field.data.length;
  let seen = 0;
  for (let bin = 0; bin < bins; bin++) {
    seen += histogram[bin];
    if (seen >= target) return (bin + 1) / bins;
  }
  return 1;
}
