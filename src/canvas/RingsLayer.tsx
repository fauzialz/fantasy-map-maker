import type Konva from "konva";
import { memo, useCallback, useRef } from "react";
import { Layer, Shape } from "react-konva";
import type { MultiPolygon, Ring } from "../engine/geometry/types";
import { useLayerCache } from "./useLayerCache";
import type { Rect } from "./viewport";

interface Props {
  bands: MultiPolygon[];
  cacheRect: Rect;
  cacheScale: number;
  onCacheBytes: (bytes: number) => void;
}

const RING_COLOR = "#245E52";

/** Strongest against the coast, fading outward — the concentric-wave look. */
const bandOpacity = (index: number, total: number) => 0.42 * (1 - index / (total + 1));

const trace = (context: Konva.Context, ring: Ring) => {
  context.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) context.lineTo(ring[i][0], ring[i][1]);
  context.closePath();
};

/**
 * The derived rings layer, drawn between the sea fill and the terrain. It holds no scene
 * objects — nothing here is editable or saved (ADR-13), so it is never the active layer
 * and is always served from its bitmap cache.
 *
 * ponytail: flat fills with an opacity falloff. The layer stack calls these "hatched"
 * rings; the hatch pattern is styling and belongs with the parchment work in WP-5.
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
      {bands.map((band, index) => (
        <Shape
          key={index}
          fill={RING_COLOR}
          opacity={bandOpacity(index, bands.length)}
          stroke={RING_COLOR}
          strokeWidth={1.5}
          sceneFunc={(context, shape) => {
            context.beginPath();
            for (const polygon of band) for (const ring of polygon) trace(context, ring);
            context.fillStrokeShape(shape);
          }}
        />
      ))}
    </Layer>
  );
});
