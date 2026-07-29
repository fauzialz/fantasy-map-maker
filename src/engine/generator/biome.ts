import type { Biome, Landmass, Point } from "../../scene/types";
import { pointInPolygon } from "../geometry/nesting";
import { signedArea } from "../geometry/types";
import { landmassToPolygon } from "../terrain/assemble";
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

/** Sample all three fields at one map-space point and label it. */
const biomeAt = (fields: Fields, u: number, v: number): Biome =>
  biomeFor(
    sampleField(fields.elevation, u, v),
    sampleField(fields.moisture, u, v),
    sampleField(fields.temperature, u, v),
  );

/**
 * Ties resolve in this fixed order rather than by whichever count `Map` happened to reach
 * first, so one seed always produces one world (the 10h determinism fixture).
 */
const BIOME_ORDER: Biome[] = ["grassland", "forest", "desert", "snow", "swamp"];

/** How many sample points across the landmass's box, per axis. */
const VOTE_GRID = 12;

/** Area-weighted centroid of a ring. For a concave ring this can lie *outside* it — see below. */
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

/**
 * The biome a landmass reads as: a majority vote over sample points that are **actually
 * inside it**.
 *
 * The obvious implementation — sample the fields at the centroid — is wrong for the shapes
 * this generator produces. A crescent coastline has its centroid out in the water, so the
 * label gets read from a place the landmass isn't; measured across nine worlds it landed
 * outside in five, every time on the largest continent, once colouring a five-million-unit
 * continent from open sea. A vote also stops a whole continent's colour hinging on one
 * pixel, which matters because v1 gives each landmass a single biome (data model §4).
 */
function voteBiome(landmass: Landmass, fields: Fields, canvas: { w: number; h: number }): Biome {
  const polygon = landmassToPolygon(landmass);
  const xs = landmass.path.map(([x]) => x);
  const ys = landmass.path.map(([, y]) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const width = Math.max(...xs) - minX;
  const height = Math.max(...ys) - minY;

  const votes = new Map<Biome, number>();
  for (let row = 0; row < VOTE_GRID; row++) {
    // Cell centres, so a sample never lands exactly on the bounding box edge.
    const y = minY + ((row + 0.5) / VOTE_GRID) * height;
    for (let col = 0; col < VOTE_GRID; col++) {
      const x = minX + ((col + 0.5) / VOTE_GRID) * width;
      if (!pointInPolygon(polygon, [x, y])) continue;
      const biome = biomeAt(fields, x / canvas.w, y / canvas.h);
      votes.set(biome, (votes.get(biome) ?? 0) + 1);
    }
  }

  // A sliver thin enough to slip between every sample still needs a colour.
  if (votes.size === 0) {
    const [x, y] = centroid(landmass.path);
    return biomeAt(fields, x / canvas.w, y / canvas.h);
  }

  let winner = BIOME_ORDER[0];
  let best = -1;
  for (const biome of BIOME_ORDER) {
    const count = votes.get(biome) ?? 0;
    if (count > best) {
      best = count;
      winner = biome;
    }
  }
  return winner;
}

/** Read the fields under each landmass and label it. */
export function assignBiomes(
  landmasses: Landmass[],
  fields: Fields,
  canvas: { w: number; h: number },
): Landmass[] {
  return landmasses.map((landmass) => ({
    ...landmass,
    biome: voteBiome(landmass, fields, canvas),
  }));
}
