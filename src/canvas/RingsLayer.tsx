import type Konva from "konva";
import { memo, useCallback, useRef } from "react";
import { Layer, Shape } from "react-konva";
import type { MultiPolygon } from "../engine/geometry/types";
import { drawRings, type DrawContext } from "./draw";
import { useLayerCache } from "./useLayerCache";
import type { Rect } from "./viewport";

interface Props {
  bands: MultiPolygon[];
  cacheRect: Rect;
  cacheScale: number;
  onCacheBytes: (bytes: number) => void;
}

/**
 * The derived rings layer, drawn between the sea fill and the terrain. It holds no scene
 * objects — nothing here is editable or saved (ADR-13), so it is never the active layer
 * and is always served from its bitmap cache.
 */
export const RingsLayer = memo(function RingsLayer({
  bands,
  cacheRect,
  cacheScale,
  onCacheBytes,
}: Props) {
  const ref = useRef<Konva.Layer>(null);
  const report = useCallback((bytes: number) => onCacheBytes(bytes), [onCacheBytes]);

  useLayerCache(ref, {
    active: false,
    cacheRect,
    cacheScale,
    content: bands,
    onCacheBytes: report,
  });

  return (
    <Layer ref={ref} listening={false}>
      <Shape
        listening={false}
        sceneFunc={(context) => drawRings(context as unknown as DrawContext, bands)}
      />
    </Layer>
  );
});
