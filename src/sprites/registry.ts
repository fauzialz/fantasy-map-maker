/**
 * Hand-drawn map sprites, stored as SVG path data on a 100x100 grid with the baseline at
 * y=88 — so an object's `x,y` anchors the foot of the sprite, which is what makes the
 * sort-by-Y depth cue read correctly.
 *
 * Path data rather than SVG files on purpose: `new Path2D(d)` rasterises it synchronously
 * with no image decode and no data: URI, and the same string is the vector original the
 * P2 SVG export needs. These are map sprites, never Lucide icons (that is UI chrome).
 */
import { pathRings, type PathRing } from "./path";

export interface Sprite {
  /** filled silhouette */
  body: string;
  /** stroked interior lines — shading, ridges, foliage detail */
  detail?: string;
  /** filled highlight, e.g. a snow cap */
  highlight?: string;
}

export type SpriteKind = "mountain" | "tree" | "landmark";

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

/**
 * Icons are ordinary sprites whose "variant" is named. The data model keys them by an open
 * `kind` string (§4), so the array order below IS the variant index — see `iconVariant`.
 */
export const ICON_KINDS = [
  "castle",
  "city",
  "town",
  "tower",
  "ruin",
  "compass",
  "ship",
  "monster",
] as const;
export type IconKind = (typeof ICON_KINDS)[number];

const ICONS: Sprite[] = [
  {
    // castle — two crenellated towers over a curtain wall
    body: "M18 88 L18 30 L23 30 L23 36 L27 36 L27 30 L32 30 L32 36 L36 36 L36 50 L40 50 L40 44 L45 44 L45 50 L55 50 L55 44 L60 44 L60 50 L64 50 L64 36 L68 36 L68 30 L73 30 L73 36 L77 36 L77 30 L82 30 L82 88 Z",
    detail: "M46 88 L46 70 Q50 64 54 70 L54 88 M25 48 L25 56 M75 48 L75 56",
  },
  {
    // city — a walled skyline
    body: "M10 88 L10 62 L20 62 L20 50 L30 50 L30 62 L38 62 L38 40 L48 40 L48 62 L56 62 L56 52 L66 52 L66 62 L76 62 L76 46 L86 46 L86 88 Z",
    detail: "M14 70 L82 70 M24 56 L24 60 M42 46 L42 54 M80 52 L80 60",
  },
  {
    // town — a pair of pitched roofs
    body: "M18 88 L18 64 L32 52 L46 64 L46 88 Z M52 88 L52 70 L64 60 L76 70 L76 88 Z",
    detail: "M28 88 L28 78 L36 78 L36 88 M62 88 L62 80 L68 80 L68 88",
  },
  {
    // tower — a single keep under a conical roof
    body: "M36 88 L36 34 L32 34 L50 14 L68 34 L64 34 L64 88 Z",
    detail: "M44 44 L44 54 L56 54 L56 44 Z M46 88 L46 74 Q50 68 54 74 L54 88",
  },
  {
    // ruin — broken walls
    body: "M14 88 L14 50 L24 50 L24 62 L34 62 L34 44 L44 44 L44 70 L58 70 L58 54 L68 54 L68 66 L78 66 L78 88 Z",
    detail: "M14 74 L78 74 M30 62 L30 74 M52 74 L52 88",
  },
  {
    // compass rose
    body: "M50 12 L58 42 L88 50 L58 58 L50 88 L42 58 L12 50 L42 42 Z",
    highlight: "M50 12 L58 42 L50 50 L42 42 Z",
    detail: "M28 28 L44 44 M72 28 L56 44 M28 72 L44 56 M72 72 L56 56",
  },
  {
    // ship — hull, mast and two sails
    body: "M12 76 L88 76 L76 88 L24 88 Z M48 66 L48 18 L52 18 L52 66 Z M54 24 L78 46 L54 58 Z M46 28 L28 46 L46 58 Z",
    detail: "M22 80 L78 80",
  },
  {
    // sea monster — a coil and a rearing head
    body: "M6 88 Q6 60 24 60 Q42 60 42 88 L32 88 Q32 70 24 70 Q16 70 16 88 Z M52 88 L52 46 Q52 30 68 30 Q86 30 86 46 Q86 56 76 58 L76 46 Q76 40 68 40 Q62 40 62 48 L62 88 Z",
    detail: "M71 42 L71 43",
  },
];

export const SPRITES: Record<SpriteKind, Sprite[]> = {
  mountain: MOUNTAINS,
  tree: TREES,
  landmark: ICONS,
};

/** Height in map units at scale 1. Mountains read as landmarks, trees as texture. */
export const SPRITE_HEIGHT: Record<SpriteKind, number> = {
  mountain: 190,
  tree: 84,
  // Icons leave more of their grid empty than mountains do, so the nominal height has to
  // run higher for a castle to read as a landmark rather than a speck beside a peak.
  landmark: 165,
};

/**
 * `kind` → registry index. An unknown kind falls back to the first icon rather than
 * vanishing: the data model calls `kind` an open string, so a scene may name one this
 * build has no artwork for, and a missing sprite would silently drop the object.
 */
export const iconVariant = (kind: string): number =>
  Math.max(0, ICON_KINDS.indexOf(kind as IconKind));

export const variantCount = (kind: SpriteKind): number => SPRITES[kind].length;

export interface Extent {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Half the sprite stroke, so the drawn outline is inside the measured extent. */
const STROKE_PAD = 1.3;

/** Wrap a variant into range, the one place the modulo lives. */
const variantIndex = (kind: SpriteKind, variant: number) => {
  const count = SPRITES[kind].length;
  return ((variant % count) + count) % count;
};

/**
 * The sprite's silhouette, as polygon rings in grid units — subpaths separate, curves
 * flattened, cached per variant like the raster.
 *
 * This is what makes picking answer to the drawn shape rather than to the box (ADR-30):
 * ink fills only 53% of a mountain's box, 50% of a tree's and **28% of the compass's**,
 * because a four-armed star is mostly the gaps between the arms.
 */
export const spriteRings = (kind: SpriteKind, variant: number): PathRing[] => {
  const key = `${kind}:${variantIndex(kind, variant)}`;
  const cached = ringCache.get(key);
  if (cached) return cached;
  const rings = pathRings(SPRITES[kind][variantIndex(kind, variant)].body);
  ringCache.set(key, rings);
  return rings;
};

/**
 * The sprite's actual drawn extent in grid units.
 *
 * The 100x100 grid is a canvas, not the artwork: every sprite leaves 8–22 units empty
 * above its peak, and some are not horizontally centred (mountain 0 spans x 4..72, so
 * its centre is 38, not 50). Anchoring and measuring on the grid instead of the content
 * is what left slack at the top of the selection frame and put the pivot off to one side.
 *
 * Measured from the path data rather than the raster: it has to work without a canvas
 * (`07` §4), and it updates itself when the artwork changes.
 *
 * **Measured from the flattened path, not from the numbers in the string** (WP-21). The
 * regex this replaced took the min/max of every number, so it counted each `Q` control
 * point as if the ink reached it — and a quadratic never gets more than half way there.
 * Walking the path tightens every box for free, and an unsupported command now throws
 * instead of being silently mis-measured (`path.ts`).
 */
export const spriteExtent = (kind: SpriteKind, variant: number): Extent => {
  const key = `${kind}:${variantIndex(kind, variant)}`;
  const cached = extentCache.get(key);
  if (cached) return cached;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of spriteRings(kind, variant)) {
    for (const [x, y] of ring) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
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
const ringCache = new Map<string, PathRing[]>();

export const GRID = 100;
/** Where the sprites' feet sit on the grid. */
export const BASELINE = 88;
