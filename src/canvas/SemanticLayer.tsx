import type Konva from "konva";
import { memo, useCallback, useMemo, useRef, type ReactNode } from "react";
import { Layer, Shape } from "react-konva";
import type { CutLandmass } from "../engine/water/cut";
import { inDrawOrder } from "../scene/order";
import type { Layer as SceneLayer, LayerId } from "../scene/types";
import { drawLayer, type DrawContext } from "./draw";
import { useLayerCache } from "./useLayerCache";
import type { Rect } from "./viewport";

/**
 * How far a layer fades while its derivation is behind the scene.
 *
 * **Milder than `RingsLayer`'s 0.25**, and deliberately: bands are chrome and can drop most
 * of the way out without the map ceasing to be a map, but the terrain *is* the map. A
 * quarter-opacity continent reads as a bug rather than as a pause, so this says "settling"
 * rather than "gone".
 */
const STALE_OPACITY = 0.55;

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
   * The **derived** land for the terrain layer (WP-40) — `union(land) − union(water)`, or
   * null/undefined when there is no water and the stored landmasses are the truth.
   *
   * Passed in rather than read here because it is **also a cache key**: the drawn coastline
   * now depends on the water layer, so water that moves has to invalidate terrain's bitmap
   * or the channel goes stale.
   */
  land?: CutLandmass[] | null;
  /**
   * Fades the layer while its derivation is behind the scene (C2, D9) — the same signal
   * `RingsLayer` gives, so the pause after a water edit reads as deliberate rather than as
   * the coastline having broken.
   */
  stale?: boolean;
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
  land,
  stale = false,
}: Props) {
  const ref = useRef<Konva.Layer>(null);
  const report = useCallback(
    (bytes: number) => onCacheBytes(layer.id, bytes),
    [onCacheBytes, layer.id],
  );
  const sorted = useMemo(() => inDrawOrder(layer.objects), [layer.objects]);

  // Identity changes when the objects change *or* the derived land does.
  const content = useMemo(() => [layer.objects, land] as const, [layer.objects, land]);

  useLayerCache(ref, {
    /**
     * An empty layer is treated as live, because there is nothing to put in a bitmap. It used
     * to be cached like any other, which allocated a viewport-sized canvas per empty layer on
     * every re-cache — and a fresh map has four of them. A live layer with no objects draws
     * nothing and costs nothing.
     *
     * **`land` is what makes an empty terrain layer non-empty**: a landmass wholly consumed by
     * water leaves objects behind but draws nothing, and one that is merely severed draws two
     * pieces from one object — so the object count alone stopped being the question.
     */
    active: active || (layer.objects.length === 0 && !land),
    cacheRect,
    cacheScale,
    content,
    onCacheBytes: report,
  });

  return (
    <Layer ref={ref} visible={layer.visible} listening={false} opacity={stale ? STALE_OPACITY : 1}>
      <Shape
        listening={false}
        sceneFunc={(context) =>
          drawLayer(context as unknown as DrawContext, layer.objects, sorted, land)
        }
      />
      {overlay}
    </Layer>
  );
});
