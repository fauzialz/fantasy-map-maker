import type Konva from "konva";
import { memo, useCallback, useMemo, useRef, type ReactNode } from "react";
import { Layer, Shape } from "react-konva";
import type { MultiPolygon } from "../engine/geometry/types";
import { inDrawOrder } from "../scene/order";
import type { Layer as SceneLayer, LayerId } from "../scene/types";
import { drawLayer, type DrawContext } from "./draw";
import { useLayerCache } from "./useLayerCache";
import type { Rect } from "./viewport";

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
  /**
   * The land, for the rivers layer to mask its mouths against (WP-34). Passed in rather
   * than read here because it is **also a cache key**: a river's outline depends on terrain,
   * so a coastline that moves has to invalidate this layer's bitmap or the mouth goes stale.
   */
  mask?: MultiPolygon;
}

/**
 * A layer's objects are drawn by ONE Konva shape rather than one node each.
 *
 * A scattered forest is 1–2k objects; a node apiece means that many nodes to build,
 * transform and hit-test per frame. Batching keeps it to a single draw loop over cached
 * sprite bitmaps. Nothing is lost: per-object hit-testing is rbush's job (ADR-16), not
 * Konva's, and sorting happens here anyway.
 */
export const SemanticLayer = memo(function SemanticLayer({
  layer,
  active,
  cacheRect,
  cacheScale,
  onCacheBytes,
  overlay,
  mask,
}: Props) {
  const ref = useRef<Konva.Layer>(null);
  const report = useCallback(
    (bytes: number) => onCacheBytes(layer.id, bytes),
    [onCacheBytes, layer.id],
  );
  const sorted = useMemo(() => inDrawOrder(layer.objects), [layer.objects]);

  // Identity changes when the objects change *or* the land under them does.
  const content = useMemo(() => [layer.objects, mask] as const, [layer.objects, mask]);

  useLayerCache(ref, {
    active,
    cacheRect,
    cacheScale,
    content,
    onCacheBytes: report,
  });

  return (
    <Layer ref={ref} visible={layer.visible} listening={false}>
      <Shape
        listening={false}
        sceneFunc={(context) =>
          drawLayer(context as unknown as DrawContext, layer.objects, sorted, mask)
        }
      />
      {overlay}
    </Layer>
  );
});
