import { landmassAt } from "../../scene/bounds";
import type { Landmass, Mountain, Point, Tree } from "../../scene/types";
import { variantCount } from "../../sprites/registry";
import { sampleField, type Fields } from "./fields";

/**
 * 10e–10g — where mountains and forests go, how far apart they stand, and how the total
 * gets back inside the perf budget.
 */

export interface ScatterOptions {
  rng: () => number;
  canvas: { w: number; h: number };
  /** minimum distance between any two placed points, in map units */
  radius: number;
  /** how many positions to try; density turns into this */
  candidates: number;
  accept: (x: number, y: number) => boolean;
}

/**
 * Poisson-disk spacing by dart throwing against a grid: a candidate is kept only when no
 * accepted point lies within `radius`, so the guarantee is exact rather than statistical.
 * Cells are `radius/√2` across, which holds at most one point each, so the check is a
 * fixed 5×5 neighbourhood.
 *
 * ponytail: dart throwing, not Bridson. Bridson packs tighter for the same radius; this
 * one is fifteen lines and a scatter that thins out toward the end is what a hand-drawn
 * range looks like anyway. Swap it in if the ranges ever look sparse.
 */
export function scatterPoints({
  rng,
  canvas,
  radius,
  candidates,
  accept,
}: ScatterOptions): Point[] {
  const cell = radius / Math.SQRT2;
  const cols = Math.max(1, Math.ceil(canvas.w / cell));
  const rows = Math.max(1, Math.ceil(canvas.h / cell));
  const grid = new Int32Array(cols * rows).fill(-1);
  const points: Point[] = [];

  const free = (x: number, y: number): boolean => {
    const cx = Math.floor(x / cell);
    const cy = Math.floor(y / cell);
    for (let gy = Math.max(0, cy - 2); gy <= Math.min(rows - 1, cy + 2); gy++) {
      for (let gx = Math.max(0, cx - 2); gx <= Math.min(cols - 1, cx + 2); gx++) {
        const index = grid[gy * cols + gx];
        if (index < 0) continue;
        const [px, py] = points[index];
        if (Math.hypot(px - x, py - y) < radius) return false;
      }
    }
    return true;
  };

  for (let i = 0; i < candidates; i++) {
    const x = rng() * canvas.w;
    const y = rng() * canvas.h;
    if (!accept(x, y) || !free(x, y)) continue;
    grid[Math.floor(y / cell) * cols + Math.floor(x / cell)] = points.length;
    points.push([x, y]);
  }

  return points;
}

const jitter = (rng: () => number, spread: number) => (rng() - 0.5) * 2 * spread;

/**
 * A scattered anchor, from a seeded rng.
 *
 * **`rotation` is an input, not a constant (WP-27, `12` D4).** This used to say it gave the
 * "same jittered look the scatter brush gives by hand" and take a hardcoded 5 — which stopped
 * being true the moment the brush's spread became a knob defaulting to 0. The two are
 * deliberately separate now: the brush's spread belongs to the map you are drawing, and this
 * one belongs to the world *recipe*, so it travels in the world code and a generated world
 * cannot change because a rail slider moved.
 */
function placed(rng: () => number, [x, y]: Point, rotation: number) {
  return {
    id: crypto.randomUUID(),
    x,
    y,
    rotation: jitter(rng, rotation),
    scale: 1 + jitter(rng, 0.28),
    z: 0,
  };
}

export interface ScatterFields {
  fields: Fields;
  canvas: { w: number; h: number };
  landmasses: Landmass[];
  seaLevel: number;
  /** what counts as the top of this world — the elevation field's near-maximum */
  peak: number;
  /** rotation spread in degrees, ±, applied to every scattered sprite */
  rotation: number;
  rng: () => number;
}

/**
 * High ground is relative to the terrain that actually exists. The world-type falloff
 * scales the elevation field down, so a threshold measured against an abstract 1.0 can sit
 * above every hill on the map and scatter nothing at all.
 */
export const ridgeLevel = (seaLevel: number, peak: number): number =>
  seaLevel + (peak - seaLevel) * 0.45;

/** Above this, it is bare rock: mountains yes, forests no. */
export const treeLine = (seaLevel: number, peak: number): number =>
  seaLevel + (peak - seaLevel) * 0.62;

/**
 * Darts to throw for a given density. Proportional to canvas area over the spacing a point
 * claims, so "forest density 0.5" means the same thing on a portrait canvas as a landscape
 * one instead of quietly thinning out on the larger preset.
 */
const darts = (
  canvas: { w: number; h: number },
  radius: number,
  density: number,
  weight: number,
): number => Math.round((weight * density * canvas.w * canvas.h) / (radius * radius));

/** 10e — mountains ride the ridges: the top of what is above sea level, and only on land. */
export function scatterMountains(
  { fields, canvas, landmasses, seaLevel, peak, rotation, rng }: ScatterFields,
  density: number,
): Mountain[] {
  const ridge = ridgeLevel(seaLevel, peak);
  const points = scatterPoints({
    rng,
    canvas,
    radius: 58,
    candidates: darts(canvas, 58, density, 2.4),
    accept: (x, y) =>
      sampleField(fields.elevation, x / canvas.w, y / canvas.h) >= ridge &&
      landmassAt(landmasses, x, y) !== undefined,
  });

  return points.map((point) => ({
    ...placed(rng, point, rotation),
    type: "mountain" as const,
    variant: Math.floor(rng() * variantCount("mountain")),
  }));
}

/**
 * 10f — forests want moisture and middling ground: not the sea, not the peaks, not desert.
 *
 * ponytail: density is a *dart count*, not a target — if the accept predicate is satisfied by
 * very little of the map, few darts land. Measured at 4000×3000, seeds 1–3: the `multiple`
 * world type gave 81 trees where its neighbours gave ~950, because its band of high moisture
 * at middling elevation can be small. Count accepted points and re-throw toward a target if
 * generated worlds start reading under-forested.
 */
export function scatterForests(
  { fields, canvas, landmasses, seaLevel, peak, rotation, rng }: ScatterFields,
  density: number,
): Tree[] {
  const limit = treeLine(seaLevel, peak);
  const points = scatterPoints({
    rng,
    canvas,
    radius: 34,
    candidates: darts(canvas, 34, density, 1.6),
    accept: (x, y) => {
      const u = x / canvas.w;
      const v = y / canvas.h;
      const elevation = sampleField(fields.elevation, u, v);
      if (elevation <= seaLevel || elevation >= limit) return false;
      if (sampleField(fields.moisture, u, v) < 0.45) return false;
      const home = landmassAt(landmasses, x, y);
      return home !== undefined && home.biome !== "desert";
    },
  });

  return points.map((point) => ({
    ...placed(rng, point, rotation),
    type: "tree" as const,
    variant: Math.floor(rng() * variantCount("tree")),
  }));
}

/** Keep `count` items, evenly spaced through the list — thinning without clustering. */
export function thin<T>(items: T[], count: number): T[] {
  if (count >= items.length) return items;
  if (count <= 0) return [];
  const step = items.length / count;
  return Array.from({ length: count }, (_, i) => items[Math.floor(i * step)]);
}

/**
 * 10g — the perf budget is about the total on screen (ADR-20), so an over-full world is
 * thinned proportionally rather than by dropping one kind entirely.
 */
export function capToBudget(
  mountains: Mountain[],
  trees: Tree[],
  budget: number,
): { mountains: Mountain[]; trees: Tree[] } {
  const total = mountains.length + trees.length;
  if (total <= budget) return { mountains, trees };
  const ratio = budget / total;
  return {
    mountains: thin(mountains, Math.floor(mountains.length * ratio)),
    trees: thin(trees, Math.floor(trees.length * ratio)),
  };
}
