import polygonClipping from "polygon-clipping";
import type { Landmass } from "../../../scene/types";
import { TOL } from "../../geometry/coords";
import { pointInMultiPolygon } from "../../geometry/nesting";
import {
  multiPolygonArea,
  polygonArea,
  type MultiPolygon,
  type Point,
  type Polygon,
  type Rect,
  type Ring,
} from "../../geometry/types";
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
  | { type: "smallerPieceHasFreshId"; notEqualTo: string; nameEmpty?: boolean }
  | { type: "pointInside"; target?: string; bands?: string; point: Point; expected: boolean }
  | { type: "singleComponentInBBox"; bands: string; bbox: Rect }
  | { type: "noOverlapInBBox"; bands: string; bbox: Rect }
  | { type: "landNeverCovered"; bands: string; land: string };

export interface AssertionContext {
  /** Geometry results (S2, S7): one entry per disjoint polygon-with-holes. */
  multi?: MultiPolygon;
  /** Object results (S9). */
  objects?: Landmass[];
  /** Ring bands (S13, S14), one MultiPolygon per band. */
  bands?: MultiPolygon[];
  /** The input land the bands were derived from (S14). */
  land?: MultiPolygon;
}

const bboxPolygon = (bbox: Rect): MultiPolygon => [
  [
    [
      [bbox.x, bbox.y],
      [bbox.x + bbox.w, bbox.y],
      [bbox.x + bbox.w, bbox.y + bbox.h],
      [bbox.x, bbox.y + bbox.h],
    ],
  ],
];

const intersect = (a: MultiPolygon, b: MultiPolygon): MultiPolygon =>
  a.length === 0 || b.length === 0 ? [] : polygonClipping.intersection(a, b);

const unionAll = (multis: MultiPolygon[]): MultiPolygon => {
  const parts = multis.filter((multi) => multi.length > 0);
  if (parts.length === 0) return [];
  return polygonClipping.union(parts[0], ...parts.slice(1));
};

const perimeter = (multi: MultiPolygon): number =>
  multi.reduce(
    (total, polygon) =>
      total +
      polygon.reduce(
        (sum, ring) =>
          sum +
          ring.reduce((length, [x1, y1], i) => {
            const [x2, y2] = ring[(i + 1) % ring.length];
            return length + Math.hypot(x2 - x1, y2 - y1);
          }, 0),
        0,
      ),
    0,
  );

/**
 * Area assertions need an area tolerance, not a coordinate one.
 *
 * The fixtures specify `tol: 0.01`, which is 1/SCALE — the precision of a *coordinate*
 * after the scaled-int round trip the boolean ops require. Comparing areas across that
 * boundary, a shared edge can shift by up to 1/SCALE along its whole length, so the area
 * can differ by up to perimeter/SCALE. Measured: quantising a two-island fixture's land
 * with no ring maths at all already moves 0.74 units of area.
 *
 * Using the coordinate tolerance for an area comparison would fail correct geometry,
 * which is exactly the brittleness `fixtures/README.md` warns against.
 */
const areaTolerance = (boundary: MultiPolygon): number => Math.max(TOL, perimeter(boundary) * TOL);

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

    case "pointInside": {
      const target = context.bands ? unionAll(context.bands) : multi;
      const actual = pointInMultiPolygon(target, assertion.point);
      return actual === assertion.expected
        ? null
        : `pointInside ${assertion.point}: expected ${assertion.expected}, got ${actual}`;
    }

    case "singleComponentInBBox": {
      const inside = intersect(unionAll(context.bands ?? []), bboxPolygon(assertion.bbox));
      return inside.length === 1
        ? null
        : `singleComponentInBBox: expected 1 connected component, got ${inside.length}`;
    }

    case "noOverlapInBBox": {
      // Coverage multiplicity ≤ 1: summed band areas must equal the area of their union.
      const box = bboxPolygon(assertion.bbox);
      const bands = context.bands ?? [];
      const summed = bands.reduce(
        (total, band) => total + multiPolygonArea(intersect(band, box)),
        0,
      );
      const union = intersect(unionAll(bands), box);
      const merged = multiPolygonArea(union);
      return Math.abs(summed - merged) <= areaTolerance(union)
        ? null
        : `noOverlapInBBox: bands cover ${summed.toFixed(4)} but their union is ${merged.toFixed(4)} — they overlap`;
    }

    case "landNeverCovered": {
      const land = context.land ?? [];
      const covered = multiPolygonArea(intersect(unionAll(context.bands ?? []), land));
      return covered <= areaTolerance(land)
        ? null
        : `landNeverCovered: bands cover ${covered.toFixed(4)} of land area (tolerance ${areaTolerance(land).toFixed(4)})`;
    }
  }
}

/** Compare areas within tolerance — geometry is never compared with float equality. */
export const areaCloseTo = (a: number, b: number, tol = TOL): boolean => Math.abs(a - b) <= tol;
