/**
 * Map-space ↔ screen-space viewport math. Pure functions, no Konva — the stage just
 * applies the result. Screen = map * scale + pan (ADR-02: bounded canvas, no infinite
 * zoom, so both scale and pan are clamped).
 */

export interface Size {
  w: number;
  h: number;
}
export interface Rect extends Size {
  x: number;
  y: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Viewport {
  scale: number;
  /** stage offset in screen px */
  x: number;
  y: number;
}

export const MAX_SCALE = 4;
export const ZOOM_STEP = 1.1;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/**
 * How far below fit the canvas may shrink (WP-28, **ADR-38**).
 *
 * `fitScale` used to be the minimum zoom as well as the fitting scale, so the furthest you
 * could pull back was the exact moment the canvas filled the viewport — you could never see
 * the map as an object with edges, which is what you want when judging composition.
 *
 * **Still bounded.** ADR-02 rejected *infinite* zoom for unbounded memory and export; half of
 * fit is a wider bound, not the absence of one.
 */
export const MIN_FIT_FRACTION = 0.5;

/** Scale at which the whole map fits the viewport. The floor sits below it — see above. */
export const fitScale = (map: Size, view: Size): number => Math.min(view.w / map.w, view.h / map.h);

export function clampScale(scale: number, map: Size, view: Size): number {
  const min = fitScale(map, view) * MIN_FIT_FRACTION;
  // A viewport larger than the map at MAX_SCALE would invert the range.
  return clamp(scale, min, Math.max(MAX_SCALE, min));
}

/**
 * How much of the map has to stay on screen along an axis, as a fraction of whichever is
 * smaller — the map or the viewport.
 *
 * ADR-38 let the canvas shrink to half of fit so it could be seen as an object with edges, and
 * left panning alone: the map edge stayed a hard wall, so anything drawn at the coast was
 * jammed against the screen edge, and a map smaller than the viewport was pinned dead centre
 * with nowhere to go at all.
 *
 * Taking the **smaller** of the two is what makes one number mean the right thing at both ends
 * of the zoom range:
 *
 * - **Zoomed out**, the map is the smaller, so half *the canvas* may leave the viewport — you
 *   can push it to the edge and look at a corner with room around it.
 * - **Zoomed in**, the viewport is the smaller, so the map must still cover half *the screen*.
 *   Half the viewport of empty ground is slack enough to work at the coast, and it stops the
 *   map being flicked out of sight entirely, which a fraction of the map's own size would
 *   allow once the map is several screens wide.
 *
 * **Still bounded**, and it costs no memory: `padRect` clips every cache rect to the map, so
 * the empty ground beyond the edge is never rasterised. That was ADR-38's argument too.
 */
export const PAN_KEEP = 0.5;

/**
 * One axis of the pan clamp. `span` is the map's on-screen size along it.
 *
 * **No centring branch.** `clampPan` used to centre an axis the map did not fill, which is a
 * *framing* decision wearing a clamp's clothes — and it was the only thing centring the map on
 * first paint, so removing it means saying that out loud: `centred()` below is what the stage
 * calls when it fits a map, and the clamp now only ever says how far you may go.
 */
function panAxis(offset: number, span: number, view: number): number {
  const keep = PAN_KEEP * Math.min(span, view);
  return clamp(offset, keep - span, view - keep);
}

/** Keep at least `PAN_KEEP` of the map (or of the screen, when zoomed in) on screen. */
export function clampPan(vp: Viewport, map: Size, view: Size): Viewport {
  return {
    scale: vp.scale,
    x: panAxis(vp.x, map.w * vp.scale, view.w),
    y: panAxis(vp.y, map.h * vp.scale, view.h),
  };
}

/** The map, squarely in the middle of the viewport — the framing a fit or a reset wants. */
export const centred = (scale: number, map: Size, view: Size): Viewport => ({
  scale,
  x: (view.w - map.w * scale) / 2,
  y: (view.h - map.h * scale) / 2,
});

export const clampViewport = (vp: Viewport, map: Size, view: Size): Viewport =>
  clampPan({ ...vp, scale: clampScale(vp.scale, map, view) }, map, view);

/** Zoom about a screen point, keeping the map point under the cursor fixed. */
export function zoomAt(
  vp: Viewport,
  pointer: Point,
  factor: number,
  map: Size,
  view: Size,
): Viewport {
  const scale = clampScale(vp.scale * factor, map, view);
  const mapX = (pointer.x - vp.x) / vp.scale;
  const mapY = (pointer.y - vp.y) / vp.scale;
  return clampPan({ scale, x: pointer.x - mapX * scale, y: pointer.y - mapY * scale }, map, view);
}

/** The slice of map-space currently on screen. */
export const visibleRect = (vp: Viewport, view: Size): Rect => ({
  x: -vp.x / vp.scale,
  y: -vp.y / vp.scale,
  w: view.w / vp.scale,
  h: view.h / vp.scale,
});

/** Grow a rect by `pad` (fraction of its size) and clip it to the map. */
export function padRect(rect: Rect, pad: number, map: Size): Rect {
  const dx = rect.w * pad;
  const dy = rect.h * pad;
  const x = Math.max(0, rect.x - dx);
  const y = Math.max(0, rect.y - dy);
  return {
    x,
    y,
    w: Math.min(map.w, rect.x + rect.w + dx) - x,
    h: Math.min(map.h, rect.y + rect.h + dy) - y,
  };
}

export const rectContains = (outer: Rect, inner: Rect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

/**
 * Bytes a cached layer bitmap costs: the cache rect is map-space, so the bitmap is
 * (rect * pixelRatio) device pixels. Caching at pixelRatio = scale means the bitmap is
 * viewport-sized, never map-sized — the whole point of ADR-19.
 */
export const cacheBytes = (rect: Rect, pixelRatio: number): number =>
  Math.ceil(rect.w * pixelRatio) * Math.ceil(rect.h * pixelRatio) * 4;
