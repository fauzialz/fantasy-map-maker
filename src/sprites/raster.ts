import { PALETTE } from "../canvas/palette";
import { BASELINE, GRID, SPRITE_HEIGHT, SPRITES, spriteExtent, type SpriteKind } from "./registry";

/**
 * Sprites are rasterised **once per variant** into an in-memory canvas and drawn as
 * images from then on (system design §9). Re-running the path fills per object would put
 * a few thousand path rasterisations in every frame.
 */

/**
 * Rasterise above map scale so sprites stay crisp when zoomed in.
 *
 * ponytail: this is also the export's sharpness ceiling — an export at 2× draws these
 * 1:1, and anything above that upscales them. Raise it (at 4x the cache memory) if a
 * poster-scale export ever looks soft.
 */
const OVERSAMPLE = 2;

const FILL: Record<SpriteKind, string> = {
  mountain: "#B9AE93",
  tree: "#6F7F55",
  landmark: "#D8C9A4",
};
const STROKE: Record<SpriteKind, string> = {
  mountain: PALETTE.ink,
  tree: "#3E4A2E",
  landmark: PALETTE.ink,
};

export interface RasterSprite {
  canvas: HTMLCanvasElement;
  /** drawing size in map units */
  width: number;
  height: number;
}

const cache = new Map<string, RasterSprite>();

export function rasterSprite(kind: SpriteKind, variant: number): RasterSprite | undefined {
  const sprites = SPRITES[kind];
  const sprite = sprites[((variant % sprites.length) + sprites.length) % sprites.length];
  if (!sprite) return undefined;

  const key = `${kind}:${variant}`;
  const hit = cache.get(key);
  if (hit) return hit;

  // The path grid is square, so map units follow the sprite's nominal height.
  const size = SPRITE_HEIGHT[kind] * (GRID / BASELINE);
  const pixels = Math.round(size * OVERSAMPLE);

  const canvas = document.createElement("canvas");
  canvas.width = pixels;
  canvas.height = pixels;
  const context = canvas.getContext("2d");
  if (!context) return undefined;

  context.scale(pixels / GRID, pixels / GRID);
  context.lineJoin = "round";
  context.lineCap = "round";

  context.fillStyle = FILL[kind];
  context.strokeStyle = STROKE[kind];
  context.lineWidth = 2.6;
  const body = new Path2D(sprite.body);
  context.fill(body);
  context.stroke(body);

  if (sprite.highlight) {
    context.fillStyle = "#F2EFE6";
    context.fill(new Path2D(sprite.highlight));
  }
  if (sprite.detail) {
    context.lineWidth = 1.8;
    context.globalAlpha = 0.55;
    context.stroke(new Path2D(sprite.detail));
    context.globalAlpha = 1;
  }

  const raster: RasterSprite = { canvas, width: size, height: size };
  cache.set(key, raster);
  return raster;
}

/**
 * Draw a sprite anchored at the foot of its baseline, so `y` is where the object stands.
 * That is the same `y` the draw order sorts on, so what you see matches what sorts.
 */
export function drawSprite(
  context: CanvasRenderingContext2D,
  kind: SpriteKind,
  variant: number,
  x: number,
  y: number,
  scale: number,
  rotation: number,
): void {
  const raster = rasterSprite(kind, variant);
  if (!raster) return;

  const size = raster.width * scale;
  const content = spriteExtent(kind, variant);

  context.save();
  // Pivot on the anchor itself, and place the artwork so its own centre-line and its feet
  // meet there. Anchoring on the grid instead of the content put the pivot off to one
  // side for sprites that are not centred in their 100x100 box, and a tenth of a sprite
  // underground. rotateObjects spins each object about its anchor — this has to match,
  // or group rotation stops being rigid.
  context.translate(x, y);
  if (rotation) context.rotate((rotation * Math.PI) / 180);
  context.drawImage(
    raster.canvas,
    -((content.minX + content.maxX) / 2 / GRID) * size,
    -(BASELINE / GRID) * size,
    size,
    size,
  );
  context.restore();
}

/**
 * The sprite's drawn extent in map units, measured from its anchor and before rotation:
 * `left`/`right` either side of the anchor, `top` above it (negative), `bottom` at 0.
 *
 * This is the artwork's own box, not the 100x100 grid it was drawn on — the grid has
 * empty margins that differ per variant, and counting them left visible slack above the
 * sprite in the selection frame.
 */
export function spriteBounds(kind: SpriteKind, variant: number, scale: number) {
  const size = SPRITE_HEIGHT[kind] * (GRID / BASELINE) * scale;
  const content = spriteExtent(kind, variant);
  const centerX = (content.minX + content.maxX) / 2;
  const unit = size / GRID;

  return {
    left: (content.minX - centerX) * unit,
    right: (content.maxX - centerX) * unit,
    top: (content.minY - BASELINE) * unit,
    bottom: (content.maxY - BASELINE) * unit,
    get width() {
      return (content.maxX - content.minX) * unit;
    },
    get height() {
      return (content.maxY - content.minY) * unit;
    },
  };
}
