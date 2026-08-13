import { drawBackground, drawLayer, drawRings, drawVignette } from "../canvas/draw";
import { PALETTE } from "../canvas/palette";
import type { Size } from "../canvas/viewport";
import type { DerivedTerrain } from "../engine/water/derive";
import { callGeometry } from "../engine/worker/client";
import type { Landmass, Scene, Water } from "../scene/types";

/**
 * WP-11 — the scene rendered to an image file, at a user-chosen scale.
 *
 * The map is drawn onto one offscreen canvas by the same `canvas/draw.ts` functions the
 * stage uses, so what exports is what is on screen. The stage itself cannot be the
 * source: it is viewport-sized and its inactive layers are cached at viewport resolution
 * (ADR-19), so exporting from it would upscale a screen-resolution bitmap.
 */

export const FORMATS = {
  png: { mime: "image/png", extension: "png" },
  jpg: { mime: "image/jpeg", extension: "jpg" },
  webp: { mime: "image/webp", extension: "webp" },
} as const;

export type Format = keyof typeof FORMATS;

/** Lossy quality for jpg/webp. Above ~0.92 the file grows much faster than it improves. */
const QUALITY = 0.92;

/** Browser canvas ceiling, and ADR-20's stated clamp: ~16k px a side. */
export const MAX_SIDE = 16384;

/**
 * ponytail: 64 MP is a memory ceiling, not a spec one — a bitmap costs 4 bytes a pixel,
 * so this is ~256 MB before the encoder's own copy. Past it browsers stop throwing and
 * start handing back a *blank* canvas, which is the one export failure ADR-20 names.
 * Tile-render + stitch is the upgrade if poster sizes are ever wanted.
 */
export const MAX_PIXELS = 64e6;

export interface ExportPlan {
  /** the scale actually used — the requested one unless it had to be capped */
  scale: number;
  w: number;
  h: number;
  capped: boolean;
}

/** What a requested scale will really produce, and whether the clamp had to bite. */
export function planExport(map: Size, scale: number): ExportPlan {
  const limit = Math.min(
    MAX_SIDE / map.w,
    MAX_SIDE / map.h,
    Math.sqrt(MAX_PIXELS / (map.w * map.h)),
  );
  const capped = scale > limit;
  const final = capped ? limit : scale;
  // Floor, never round: rounding up at the limit is how you land one pixel over it.
  return {
    scale: final,
    w: Math.max(1, Math.floor(map.w * final)),
    h: Math.max(1, Math.floor(map.h * final)),
    capped,
  };
}

/**
 * The whole map on one canvas, in the stage's own composition order: paper and sea, the
 * derived rings, the six semantic layers, then the vignette.
 */
export function renderScene(
  scene: Scene,
  derived: DerivedTerrain,
  plan: ExportPlan,
): HTMLCanvasElement {
  const map = { w: scene.meta.canvas.w, h: scene.meta.canvas.h };
  const canvas = document.createElement("canvas");
  canvas.width = plan.w;
  canvas.height = plan.h;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no 2d context");

  // The flatten JPG needs: an opaque canvas before anything is drawn, so a transparent
  // pixel can never reach the encoder and come out black.
  ctx.fillStyle = PALETTE.paper;
  ctx.fillRect(0, 0, plan.w, plan.h);

  ctx.scale(plan.scale, plan.scale);
  drawBackground(ctx, map, scene.settings.parchment);
  if (scene.settings.coastalRings) drawRings(ctx, derived.bands);
  // The export draws through the same derivation as the screen, so a channel cannot differ
  // between the two — one renderer, two consumers.
  for (const layer of scene.layers)
    if (layer.visible)
      drawLayer(ctx, layer.objects, undefined, layer.id === "terrain" ? derived.land : undefined);
  if (scene.settings.parchment) drawVignette(ctx, map);

  return canvas;
}

export function toBlob(canvas: HTMLCanvasElement, format: Format): Promise<Blob> {
  const { mime } = FORMATS[format];
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      // A canvas over the browser's limit encodes to null rather than throwing — the
      // blank-export failure, caught here instead of downloading an empty file.
      (blob) => (blob ? resolve(blob) : reject(new Error(`${format} encoding failed`))),
      mime,
      format === "png" ? undefined : QUALITY,
    );
  });
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking in the same task cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Filesystem-safe name from the map's title, so exports don't all land as `map.png`. */
export const exportFilename = (scene: Scene, format: Format): string =>
  `${(scene.meta.title || "map").replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "map"}.${
    FORMATS[format].extension
  }`;

/**
 * The derivation a static render needs, fetched fresh from the worker.
 *
 * Derived rather than borrowed from the stage because none of it is stored (ADR-13, ADR-47),
 * and one worker round-trip is cheaper than plumbing the stage's copy out to a dialog and a
 * thumbnail job that both run outside it. Lives here because both callers already render
 * through this module, and two copies of the payload is two places for the export to drift
 * from the screen.
 *
 * **Layer visibility is honoured on the way in**: a hidden water layer subtracts nothing, so
 * an export matches what the toggle shows (D9).
 */
export async function deriveForRender(scene: Scene): Promise<DerivedTerrain> {
  const landmasses = layerObjects<Landmass>(scene, "terrain");
  // Water alone answers to its layer's visibility here, because hiding it changes the
  // *geometry* rather than what is painted (D9). Terrain's own toggle is honoured by the
  // draw loop above, as every other layer's is.
  const waters = layerObjects<Water>(scene, "water", true);
  if (landmasses.length === 0) return { land: null, bands: [] };
  const { canvas } = scene.meta;
  return callGeometry("deriveTerrain", {
    landmasses,
    waters,
    canvas: { x: 0, y: 0, w: canvas.w, h: canvas.h },
    ringCount: scene.settings.ringCount,
    ringGap: scene.settings.ringGap,
    rings: scene.settings.coastalRings,
  });
}

const layerObjects = <T>(scene: Scene, id: "terrain" | "water", hideable = false): T[] => {
  const layer = scene.layers.find((l) => l.id === id);
  if (!layer || (hideable && !layer.visible)) return [];
  return layer.objects as T[];
};
