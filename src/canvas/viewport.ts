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

/** Keep the map covering the viewport; centre it on any axis where it is smaller. */
export function clampPan(vp: Viewport, map: Size, view: Size): Viewport {
  const sw = map.w * vp.scale;
  const sh = map.h * vp.scale;
  return {
    scale: vp.scale,
    x: sw <= view.w ? (view.w - sw) / 2 : clamp(vp.x, view.w - sw, 0),
    y: sh <= view.h ? (view.h - sh) / 2 : clamp(vp.y, view.h - sh, 0),
  };
}

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
