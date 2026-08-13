import type { MultiPolygon } from "../engine/geometry/types";
import type { CutLandmass } from "../engine/water/cut";
import { isSprite, spriteRef } from "../scene/bounds";
import { inDrawOrder } from "../scene/order";
import type { Biome, Landmass, Ring, SceneObject } from "../scene/types";
import { drawSprite } from "../sprites/raster";
import { drawLabel } from "../sprites/text";
import { BIOME_FILL, LAND_OPACITY, PALETTE, SEA_OPACITY } from "./palette";
import { hatchTile, parchmentTile } from "./textures";
import type { Size } from "./viewport";

/**
 * Every mark on the map is made here, in map-space, against a plain 2D context. The stage
 * draws through Konva `sceneFunc`s and WP-11's export draws onto its own canvas — one
 * renderer, two consumers, so an export cannot drift out of step with the screen.
 *
 * Konva's `Context` proxies the subset used below, so a cast is all either side needs.
 * **`fillRect` is not on that list** — build a `rect()` and `fill()` it instead.
 */
export type DrawContext = CanvasRenderingContext2D;

const trace = (ctx: DrawContext, ring: Ring) => {
  ctx.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
  ctx.closePath();
};

/**
 * Paper, then sea. The parchment covers the whole map and the sea is a translucent tint
 * over it, so the grain reads through the water instead of the water being a flat slab.
 * With `settings.parchment` off the paper falls back to a flat tone and the sea stays.
 */
export function drawBackground(ctx: DrawContext, map: Size, parchment: boolean): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, map.w, map.h);
  ctx.fillStyle = (parchment && ctx.createPattern(parchmentTile(), "repeat")) || PALETTE.paper;
  ctx.fill();
  ctx.globalAlpha = SEA_OPACITY;
  ctx.fillStyle = PALETTE.sea;
  ctx.fill();
  ctx.restore();
}

const HATCH_SCALE = 3.5;

/** Strongest against the coast, fading outward — the concentric-wave look. */
const bandOpacity = (index: number, total: number) => 0.85 * (1 - index / (total + 1.2));

/**
 * The derived ring bands, between the sea fill and the terrain. Filled with diagonal
 * hatching — the "coastal hatched rings" of the layer stack — at an opacity that falls
 * off with distance from the coast.
 */
export function drawRings(ctx: DrawContext, bands: MultiPolygon[]): void {
  if (bands.length === 0) return;
  const hatch = ctx.createPattern(hatchTile(), "repeat");
  // The tile is 8px, but the pattern lives in map space — unscaled it is subpixel at fit
  // zoom and averages into a flat wash instead of hatching.
  hatch?.setTransform({ a: HATCH_SCALE, b: 0, c: 0, d: HATCH_SCALE, e: 0, f: 0 });

  ctx.save();
  ctx.strokeStyle = PALETTE.ring;
  ctx.lineWidth = 1.2;
  bands.forEach((band, index) => {
    ctx.globalAlpha = bandOpacity(index, bands.length);
    ctx.fillStyle = hatch ?? PALETTE.ring;
    ctx.beginPath();
    for (const polygon of band) for (const ring of polygon) trace(ctx, ring);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

/**
 * Fill and coast-stroke one biome's worth of land.
 *
 * The rings are traced into a single path before filling, so the non-zero fill rule cuts
 * holes out (S6, which winds them opposite to their outer) — and, since WP-40, so that a
 * landmass severed by a river fills and strokes as **one** operation. Two fills would
 * double the alpha where nothing overlaps; two strokes would be indistinguishable, but the
 * fill would show the seam.
 */
function paintLand(ctx: DrawContext, shape: MultiPolygon, biome: Biome): void {
  if (shape.length === 0) return;
  ctx.save();
  ctx.beginPath();
  for (const polygon of shape) for (const ring of polygon) trace(ctx, ring);
  ctx.globalAlpha = LAND_OPACITY;
  ctx.fillStyle = BIOME_FILL[biome];
  ctx.fill();
  ctx.strokeStyle = PALETTE.coast;
  ctx.lineWidth = 3;
  ctx.lineJoin = "round";
  ctx.stroke();
  ctx.restore();
}

/**
 * A landmass exactly as stored: an outer coastline plus holes (lakes).
 *
 * This is the water-free path, and it stays because it is the common one — a map with no
 * water is drawn straight from the scene with no derivation to wait for (`DerivedTerrain`).
 */
export function drawLandmass(ctx: DrawContext, landmass: Landmass): void {
  paintLand(ctx, [[landmass.path, ...landmass.holes]], landmass.biome);
}

/**
 * WP-40 — the land as `union(land) − union(water)`, derived and passed in (ADR-47).
 *
 * **The coast stroke follows the cut**, which is the entire visual argument for the design:
 * a river's banks are stroked because they *are* coastline, and its estuary carries no bar
 * across it because there is no mouth there to cross — only shore.
 */
export function drawCutLand(ctx: DrawContext, land: CutLandmass[]): void {
  for (const piece of land) paintLand(ctx, piece.shape, piece.biome);
}

/**
 * One layer's contents, in the order the layer stacks them: path objects in array order,
 * then everything with an anchor by draw order (data model §5).
 *
 * `sorted` is a parameter so the live renderer can memoise the sort across frames; the
 * export, which draws once, lets it default.
 *
 * ponytail: the whole layer redraws on any change, so a scatter stroke redraws every
 * object in it per placement. Fine at the ~1-2k budget; if it ever isn't, the upgrade is
 * drawing only the dirty rect.
 */
export function drawLayer(
  ctx: DrawContext,
  objects: SceneObject[],
  sorted: SceneObject[] = inDrawOrder(objects),
  land?: CutLandmass[] | null,
): void {
  /**
   * The terrain layer draws the **derived** land when there is any water to cut it with, and
   * the stored landmasses otherwise.
   *
   * The water layer draws nothing at all, and there is no branch here for it: water is a
   * *geometry* layer rather than a paint layer — the first in this app — and its only visual
   * contribution is the shape it removes from terrain (`16` §3). Water over open sea is
   * therefore invisible, which is D16 and is exactly right at an estuary.
   */
  if (land) drawCutLand(ctx, land);
  else for (const object of objects) if (object.type === "landmass") drawLandmass(ctx, object);
  for (const object of sorted) {
    if (object.type === "label") {
      drawLabel(ctx, object);
    } else if (isSprite(object)) {
      const { kind, variant } = spriteRef(object);
      drawSprite(ctx, kind, variant, object.x, object.y, object.scale, object.rotation);
    }
  }
}

/**
 * Aged-paper edge darkening, above everything. Part of the parchment treatment, so it
 * follows the same toggle.
 */
export function drawVignette(ctx: DrawContext, map: Size): void {
  const radius = Math.hypot(map.w, map.h) / 2;
  const gradient = ctx.createRadialGradient(
    map.w / 2,
    map.h / 2,
    radius * 0.55,
    map.w / 2,
    map.h / 2,
    radius,
  );
  // Both stops are the same ink so the fade is pure alpha; interpolating to `transparent`
  // would run through transparent *black* and leave a grey cast on a warm page.
  gradient.addColorStop(0, `rgb(${PALETTE.vignette} / 0)`);
  gradient.addColorStop(1, `rgb(${PALETTE.vignette} / 0.16)`);

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.rect(0, 0, map.w, map.h);
  ctx.fill();
  ctx.restore();
}
