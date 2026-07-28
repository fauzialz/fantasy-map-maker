import type { Landmass } from "../../../scene/types";
import { TOL } from "../../geometry/coords";
import { polygonArea, type MultiPolygon, type Polygon, type Ring } from "../../geometry/types";
import { createMask, stampMask, type Mask } from "../mask";

/**
 * The fixture harness described in `architecture/v1/fixtures/README.md`: it materialises
 * the parametric inputs and evaluates the property assertions. Geometry fixtures assert
 * *properties*, never exact vertices — the exact points depend on offset and rounding
 * parameters, so a hand-drawn "expected" output would fail a correct implementation.
 *
 * Never compare geometry with float `==`; every comparison here is within `tol`.
 */

export interface DiscInput {
  type: "disc";
  cx: number;
  cy: number;
  r: number;
}
export interface PolygonInput {
  type: "polygon";
  path: Ring;
  holes?: Ring[];
}
export type ShapeInput = DiscInput | PolygonInput;

export interface LandmassInput {
  type: "landmass";
  id: string;
  name?: string;
  shape: ShapeInput;
}
export interface MaskInput {
  type: "mask";
  canvas: { w: number; h: number };
  shapes: ShapeInput[];
  holes?: ShapeInput[];
}

export const DEFAULT_TESSELLATION = 64;

/** Discs tessellate to a fixed segment count so every run is deterministic. */
export function materializeShape(shape: ShapeInput, tessellation = DEFAULT_TESSELLATION): Polygon {
  if (shape.type === "disc") {
    const ring: Ring = Array.from({ length: tessellation }, (_, i) => {
      const angle = (i / tessellation) * Math.PI * 2;
      return [shape.cx + Math.cos(angle) * shape.r, shape.cy + Math.sin(angle) * shape.r];
    });
    return [ring];
  }
  return [shape.path, ...(shape.holes ?? [])];
}

export function materializeLandmass(input: LandmassInput): Landmass {
  const [path, ...holes] = materializeShape(input.shape);
  return { id: input.id, type: "landmass", path, holes, biome: "grassland", name: input.name };
}

/** Rasterise fixture shapes into a binary mask (stamped as discs, or scanline-filled). */
export function materializeMask(input: MaskInput): Mask {
  const mask = createMask(input.canvas.w, input.canvas.h);
  for (const shape of input.shapes) paint(mask, shape, 1);
  for (const hole of input.holes ?? []) paint(mask, hole, 0);
  return mask;
}

function paint(mask: Mask, shape: ShapeInput, value: 0 | 1): void {
  if (shape.type === "disc") {
    stampMask(mask, [shape.cx, shape.cy], [shape.cx, shape.cy], shape.r * 2, value);
    return;
  }
  const ring = shape.path;
  const ys = ring.map(([, y]) => y);
  for (
    let y = Math.max(0, Math.floor(Math.min(...ys)));
    y <= Math.min(mask.h - 1, Math.ceil(Math.max(...ys)));
    y++
  ) {
    const crossings: number[] = [];
    for (let i = 0, n = ring.length; i < n; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % n];
      if (y1 <= y === y2 <= y) continue;
      crossings.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
    }
    crossings.sort((a, b) => a - b);
    for (let i = 0; i + 1 < crossings.length; i += 2) {
      const from = Math.max(0, Math.ceil(crossings[i]));
      const to = Math.min(mask.w - 1, Math.floor(crossings[i + 1]));
      for (let x = from; x <= to; x++) mask.data[y * mask.w + x] = value;
    }
  }
}

// ---------------------------------------------------------------- assertions

export type Assertion =
  | { type: "componentCount"; target: string; n: number }
  | { type: "holeCount"; target: string; n: number }
  | { type: "polygonCount"; n: number }
  | { type: "largestAreaHasId"; id: string }
  | { type: "smallerPieceHasFreshId"; notEqualTo: string; nameEmpty?: boolean };

export interface AssertionContext {
  /** Geometry results (S2, S7): one entry per disjoint polygon-with-holes. */
  multi?: MultiPolygon;
  /** Object results (S9). */
  objects?: Landmass[];
}

/** Returns null when the assertion holds, or a human-readable failure. */
export function evaluate(assertion: Assertion, context: AssertionContext): string | null {
  const multi =
    context.multi ??
    context.objects?.map((object): Polygon => [object.path, ...object.holes]) ??
    [];

  switch (assertion.type) {
    case "componentCount":
      return multi.length === assertion.n
        ? null
        : `componentCount: expected ${assertion.n}, got ${multi.length}`;

    case "holeCount": {
      const holes = multi.reduce((total, polygon) => total + polygon.length - 1, 0);
      return holes === assertion.n ? null : `holeCount: expected ${assertion.n}, got ${holes}`;
    }

    case "polygonCount":
      return multi.length === assertion.n
        ? null
        : `polygonCount: expected ${assertion.n}, got ${multi.length}`;

    case "largestAreaHasId": {
      const objects = context.objects ?? [];
      if (objects.length === 0) return "largestAreaHasId: no objects in result";
      const largest = objects.reduce((best, object) =>
        polygonArea([object.path, ...object.holes]) > polygonArea([best.path, ...best.holes])
          ? object
          : best,
      );
      return largest.id === assertion.id
        ? null
        : `largestAreaHasId: expected ${assertion.id}, got ${largest.id}`;
    }

    case "smallerPieceHasFreshId": {
      const objects = context.objects ?? [];
      const areaOf = (object: Landmass) => polygonArea([object.path, ...object.holes]);
      const largest = objects.reduce((best, object) =>
        areaOf(object) > areaOf(best) ? object : best,
      );
      const smaller = objects.filter((object) => object !== largest);
      if (smaller.length === 0) return "smallerPieceHasFreshId: nothing smaller in result";
      for (const object of smaller) {
        if (object.id === assertion.notEqualTo)
          return `smallerPieceHasFreshId: smaller piece reused id ${object.id}`;
        if (assertion.nameEmpty && object.name)
          return `smallerPieceHasFreshId: smaller piece kept name "${object.name}"`;
      }
      return null;
    }
  }
}

/** Compare areas within tolerance — geometry is never compared with float equality. */
export const areaCloseTo = (a: number, b: number, tol = TOL): boolean => Math.abs(a - b) <= tol;
