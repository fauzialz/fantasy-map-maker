/**
 * Hand-drawn map sprites, stored as SVG path data on a 100x100 grid with the baseline at
 * y=88 — so an object's `x,y` anchors the foot of the sprite, which is what makes the
 * sort-by-Y depth cue read correctly.
 *
 * Path data rather than SVG files on purpose: `new Path2D(d)` rasterises it synchronously
 * with no image decode and no data: URI, and the same string is the vector original the
 * P2 SVG export needs. These are map sprites, never Lucide icons (that is UI chrome).
 */
export interface Sprite {
  /** filled silhouette */
  body: string;
  /** stroked interior lines — shading, ridges, foliage detail */
  detail?: string;
  /** filled highlight, e.g. a snow cap */
  highlight?: string;
}

export type SpriteKind = "mountain" | "tree";

const MOUNTAINS: Sprite[] = [
  {
    body: "M4 88 L38 14 L72 88 Z",
    highlight: "M38 14 L25 42 L32 37 L39 45 L47 33 L52 40 Z",
    detail: "M38 20 L38 88 M38 30 L18 70 M38 30 L58 70",
  },
  {
    body: "M2 88 L26 30 L44 60 L60 18 L92 88 Z",
    highlight: "M60 18 L50 40 L56 37 L62 44 L68 33 Z",
    detail: "M60 24 L60 88 M26 36 L26 66 M60 30 L40 70",
  },
  {
    body: "M4 88 Q28 30 48 48 Q64 22 94 88 Z",
    detail: "M48 50 L48 88 M30 56 L18 78",
  },
  {
    body: "M2 88 L18 46 L28 58 L44 12 L58 48 L70 34 L94 88 Z",
    highlight: "M44 12 L34 36 L40 33 L47 40 L52 30 Z",
    detail: "M44 18 L44 88 M18 52 L10 74 M70 40 L78 66",
  },
];

const TREES: Sprite[] = [
  {
    // conifer
    body: "M46 88 L46 66 L54 66 L54 88 Z M50 8 L68 40 L59 40 L74 64 L26 64 L41 40 L32 40 Z",
    detail: "M50 16 L50 64",
  },
  {
    // broadleaf
    body: "M46 88 L46 62 L54 62 L54 88 Z M50 10 Q76 16 72 38 Q78 60 50 64 Q22 60 28 38 Q24 16 50 10 Z",
    detail: "M50 30 L50 64 M50 44 L38 34 M50 40 L62 30",
  },
  {
    // narrow conifer
    body: "M47 88 L47 68 L53 68 L53 88 Z M50 12 L64 44 L57 44 L68 68 L32 68 L43 44 L36 44 Z",
    detail: "M50 20 L50 68",
  },
  {
    // bushy pair
    body: "M47 88 L47 66 L53 66 L53 88 Z M50 18 Q70 22 68 42 Q72 62 50 66 Q28 62 32 42 Q30 22 50 18 Z",
    detail: "M50 34 L50 66 M50 46 L40 38 M50 42 L60 34",
  },
];

export const SPRITES: Record<SpriteKind, Sprite[]> = {
  mountain: MOUNTAINS,
  tree: TREES,
};

/** Height in map units at scale 1. Mountains read as landmarks, trees as texture. */
export const SPRITE_HEIGHT: Record<SpriteKind, number> = {
  mountain: 190,
  tree: 84,
};

export const variantCount = (kind: SpriteKind): number => SPRITES[kind].length;

export interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Half the sprite stroke, so the drawn outline is inside the measured extent. */
const STROKE_PAD = 1.3;

/**
 * The sprite's actual drawn extent in grid units.
 *
 * The 100x100 grid is a canvas, not the artwork: every sprite leaves 8–22 units empty
 * above its peak, and some are not horizontally centred (mountain 0 spans x 4..72, so
 * its centre is 38, not 50). Anchoring and measuring on the grid instead of the content
 * is what left slack at the top of the selection frame and put the pivot off to one side.
 *
 * Measured from the path data rather than the raster: it has to work without a canvas,
 * and it updates itself when the artwork changes. The paths use only absolute M/L/Q/Z,
 * so every number is a coordinate; Q control points sit outside the curve, which makes
 * this a slight over-estimate and never an under-estimate.
 */
export const spriteExtent = (kind: SpriteKind, variant: number): Extent => {
  const sprites = SPRITES[kind];
  const index = ((variant % sprites.length) + sprites.length) % sprites.length;
  const key = `${kind}:${index}`;
  const cached = extentCache.get(key);
  if (cached) return cached;

  const numbers = sprites[index].body.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    minX = Math.min(minX, numbers[i]);
    maxX = Math.max(maxX, numbers[i]);
    minY = Math.min(minY, numbers[i + 1]);
    maxY = Math.max(maxY, numbers[i + 1]);
  }

  const extent: Extent = {
    minX: minX - STROKE_PAD,
    minY: minY - STROKE_PAD,
    maxX: maxX + STROKE_PAD,
    maxY: maxY + STROKE_PAD,
  };
  extentCache.set(key, extent);
  return extent;
};

const extentCache = new Map<string, Extent>();

export const GRID = 100;
/** Where the sprites' feet sit on the grid. */
export const BASELINE = 88;
