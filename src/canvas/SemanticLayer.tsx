import type Konva from "konva";
import { memo, useEffect, useRef, type ReactNode } from "react";
import { Layer } from "react-konva";
import type { Layer as SceneLayer, LayerId } from "../scene/types";
import { LandmassShape } from "./shapes/LandmassShape";
import { cacheBytes, type Rect } from "./viewport";

interface Props {
  layer: SceneLayer;
  /** The active layer keeps live nodes; every other layer renders from a bitmap cache. */
  active: boolean;
  cacheRect: Rect;
  /** pixelRatio for the cache = the current zoom, so the bitmap is viewport-sized. */
  cacheScale: number;
  onCacheBytes: (id: LayerId, bytes: number) => void;
  /** in-progress stroke preview, drawn live on the active layer */
  overlay?: ReactNode;
}

export const SemanticLayer = memo(function SemanticLayer({
  layer,
  active,
  cacheRect,
  cacheScale,
  onCacheBytes,
  overlay,
}: Props) {
  const ref = useRef<Konva.Layer>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (active) {
      if (node.isCached()) node.clearCache();
      onCacheBytes(layer.id, 0);
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
      onCacheBytes(layer.id, cacheBytes(cacheRect, cacheScale));
    }
    node.batchDraw();
  }, [active, cacheRect, cacheScale, layer.id, layer.objects, onCacheBytes]);

  return (
    <Layer ref={ref} visible={layer.visible} listening={false}>
      {layer.objects.map((object) =>
        object.type === "landmass" ? <LandmassShape key={object.id} landmass={object} /> : null,
      )}
      {overlay}
    </Layer>
  );
});
