import type { Biome, Landmass, Point } from "../../scene/types";
import { signedArea } from "../geometry/types";
import { sampleField, type Fields } from "./fields";

/**
 * 10d — biome from elevation × moisture × latitude (ADR-21's modest set). Deliberately a
 * pure decision table over three normalised numbers: it is the part of the generator most
 * likely to be re-tuned by eye, and a table is what you can re-tune.
 */
export function biomeFor(elevation: number, moisture: number, temperature: number): Biome {
  if (temperature < 0.25) return "snow";
  if (temperature > 0.55 && moisture < 0.32) return "desert";
  // Wet and low-lying drowns into swamp; wet and higher grows forest.
  if (moisture > 0.62) return elevation < 0.5 ? "swamp" : "forest";
  if (moisture > 0.5) return "forest";
  return "grassland";
}

/** Area-weighted centroid of a ring — the sample point that best represents a region. */
export function centroid(ring: Point[]): Point {
  const area = signedArea(ring);
  if (area === 0) return ring[0] ?? [0, 0];

  let cx = 0;
  let cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const cross = x1 * y2 - x2 * y1;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  return [cx / (6 * area), cy / (6 * area)];
}

/** Read the three fields where a landmass sits and label it. */
export function assignBiomes(
  landmasses: Landmass[],
  fields: Fields,
  canvas: { w: number; h: number },
): Landmass[] {
  return landmasses.map((landmass) => {
    const [x, y] = centroid(landmass.path);
    const u = x / canvas.w;
    const v = y / canvas.h;
    return {
      ...landmass,
      biome: biomeFor(
        sampleField(fields.elevation, u, v),
        sampleField(fields.moisture, u, v),
        sampleField(fields.temperature, u, v),
      ),
    };
  });
}
