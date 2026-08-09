import { drawBackground, drawLayer, drawRings, drawVignette } from "../canvas/draw";
import { landMask } from "../engine/river";
import { PALETTE } from "../canvas/palette";
import type { Size } from "../canvas/viewport";
import type { MultiPolygon } from "../engine/geometry/types";
import type { Landmass, Scene } from "../scene/types";

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
  bands: MultiPolygon[],
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
  if (scene.settings.coastalRings) drawRings(ctx, bands);
  // The export draws through the same masked path, so a mouth cannot differ from the screen.
  const mask = landMask(
    scene.layers.flatMap((l) => l.objects).filter((o): o is Landmass => o.type === "landmass"),
  );
  for (const layer of scene.layers)
    if (layer.visible) drawLayer(ctx, layer.objects, undefined, mask);
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
