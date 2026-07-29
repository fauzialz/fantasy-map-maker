import type Konva from "konva";
import { memo, useCallback, useRef, type ReactNode } from "react";
import { Layer } from "react-konva";
import type { Layer as SceneLayer, LayerId } from "../scene/types";
import { LandmassShape } from "./shapes/LandmassShape";
import { ObjectBatch } from "./shapes/ObjectBatch";
import { RiverShape } from "./shapes/RiverShape";
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
  const report = useCallback(
    (bytes: number) => onCacheBytes(layer.id, bytes),
    [onCacheBytes, layer.id],
  );

  useLayerCache(ref, {
    active,
    cacheRect,
    cacheScale,
    content: layer.objects,
    onCacheBytes: report,
  });

  return (
    <Layer ref={ref} visible={layer.visible} listening={false}>
      {/* Path-based objects get a node each; everything with an anchor is batched below. */}
      {layer.objects.map((object) =>
        object.type === "landmass" ? (
          <LandmassShape key={object.id} landmass={object} />
        ) : object.type === "river" ? (
          <RiverShape key={object.id} river={object} />
        ) : null,
      )}
      <ObjectBatch objects={layer.objects} />
      {overlay}
    </Layer>
  );
});
