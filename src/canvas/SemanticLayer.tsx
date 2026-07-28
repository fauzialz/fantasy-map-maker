import type Konva from "konva";
import { memo, useEffect, useRef } from "react";
import { Layer, Rect as KonvaRect } from "react-konva";
import type { LayerId } from "../scene/types";
import { PLACEHOLDER_STYLE, placeholderRects } from "./placeholders";
import { cacheBytes, type Rect, type Size } from "./viewport";

interface Props {
  id: LayerId;
  map: Size;
  visible: boolean;
  /** The active layer keeps live nodes; every other layer renders from a bitmap cache. */
  active: boolean;
  cacheRect: Rect;
  /** pixelRatio for the cache = the current zoom, so the bitmap is viewport-sized. */
  cacheScale: number;
  onCacheBytes: (id: LayerId, bytes: number) => void;
}

export const SemanticLayer = memo(function SemanticLayer({
  id,
  map,
  visible,
  active,
  cacheRect,
  cacheScale,
  onCacheBytes,
}: Props) {
  const ref = useRef<Konva.Layer>(null);
  const style = PLACEHOLDER_STYLE[id];
  const rects = placeholderRects(id, map);

  useEffect(() => {
    const layer = ref.current;
    if (!layer) return;

    if (active) {
      if (layer.isCached()) layer.clearCache();
      onCacheBytes(id, 0);
    } else {
      // ponytail: pixelRatio = scale (CSS pixels), not scale * devicePixelRatio. Retina
      // sharpness for inactive layers costs 4x memory; raise it if the softness shows.
      layer.cache({
        x: cacheRect.x,
        y: cacheRect.y,
        width: cacheRect.w,
        height: cacheRect.h,
        pixelRatio: cacheScale,
      });
      onCacheBytes(id, cacheBytes(cacheRect, cacheScale));
    }
    layer.batchDraw();
  }, [active, cacheRect, cacheScale, id, onCacheBytes]);

  return (
    <Layer ref={ref} visible={visible} listening={false}>
      {rects.map((r, i) => (
        <KonvaRect
          key={i}
          x={r.x}
          y={r.y}
          width={r.w}
          height={r.h}
          fill={style.fill}
          opacity={active ? 1 : 0.85}
          cornerRadius={4}
        />
      ))}
    </Layer>
  );
});
