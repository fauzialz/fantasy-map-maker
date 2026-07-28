import type Konva from "konva";
import { useEffect, type RefObject } from "react";
import { cacheBytes, type Rect } from "./viewport";

interface Options {
  /** The active layer keeps live nodes; every other layer renders from a bitmap cache. */
  active: boolean;
  cacheRect: Rect;
  /** pixelRatio for the cache = the current zoom, so the bitmap is viewport-sized. */
  cacheScale: number;
  /** any value whose identity changes when the layer's contents change */
  content: unknown;
  onCacheBytes?: (bytes: number) => void;
}

/**
 * ADR-19, in one place: only the active layer keeps live nodes, and every cached bitmap
 * is sized to the viewport rather than the map. Caching six full-map layers of a
 * 4000x3000 canvas would cost ~290 MB and crash mobile Safari; this keeps it in the tens.
 */
export function useLayerCache(
  ref: RefObject<Konva.Layer | null>,
  { active, cacheRect, cacheScale, content, onCacheBytes }: Options,
): void {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (active) {
      if (node.isCached()) node.clearCache();
      onCacheBytes?.(0);
    } else {
      // ponytail: pixelRatio = scale (CSS pixels), not scale * devicePixelRatio. Retina
      // sharpness for inactive layers costs 4x memory; raise it if the softness shows.
      node.cache({
        x: cacheRect.x,
        y: cacheRect.y,
        width: cacheRect.w,
        height: cacheRect.h,
        pixelRatio: cacheScale,
      });
      onCacheBytes?.(cacheBytes(cacheRect, cacheScale));
    }
    node.batchDraw();
  }, [ref, active, cacheRect, cacheScale, content, onCacheBytes]);
}
