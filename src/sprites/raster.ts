import { PALETTE } from "../canvas/palette";
import { SPRITE_HEIGHT, SPRITES, type SpriteKind } from "./registry";

/**
 * Sprites are rasterised **once per variant** into an in-memory canvas and drawn as
 * images from then on (system design §9). Re-running the path fills per object would put
 * a few thousand path rasterisations in every frame.
 */

/** Rasterise above map scale so sprites stay crisp when zoomed in. */
const OVERSAMPLE = 2;
const GRID = 100; // the sprite path coordinate space
const BASELINE = 88; // where the sprite's feet sit on that grid

const FILL: Record<SpriteKind, string> = {
  mountain: "#B9AE93",
  tree: "#6F7F55",
};
const STROKE: Record<SpriteKind, string> = {
  mountain: PALETTE.ink,
  tree: "#3E4A2E",
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

  const width = raster.width * scale;
  const height = raster.height * scale;
  const footFromBottom = (1 - BASELINE / GRID) * height;

  context.save();
  context.translate(x, y + footFromBottom);
  if (rotation) context.rotate((rotation * Math.PI) / 180);
  context.drawImage(raster.canvas, -width / 2, -height, width, height);
  context.restore();
}

/** Bounding box in map space — used for hit-testing the object eraser. */
export function spriteBounds(kind: SpriteKind, scale: number) {
  const size = SPRITE_HEIGHT[kind] * (GRID / BASELINE) * scale;
  return { width: size, height: size };
}
