import type Konva from "konva";
import { memo, useCallback, useMemo, useRef } from "react";
import { Layer, Shape } from "react-konva";
import type { MultiPolygon, Ring } from "../engine/geometry/types";
import { PALETTE } from "./palette";
import { asPatternImage, hatchTile } from "./textures";
import { useLayerCache } from "./useLayerCache";
import type { Rect } from "./viewport";

interface Props {
  bands: MultiPolygon[];
  cacheRect: Rect;
  cacheScale: number;
  onCacheBytes: (bytes: number) => void;
}

const HATCH_SCALE = 3.5;

/** Strongest against the coast, fading outward — the concentric-wave look. */
const bandOpacity = (index: number, total: number) => 0.85 * (1 - index / (total + 1.2));

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
 * Filled with diagonal hatching — the "coastal hatched rings" of the layer stack — at an
 * opacity that falls off with distance from the coast.
 */
export const RingsLayer = memo(function RingsLayer({
  bands,
  cacheRect,
  cacheScale,
  onCacheBytes,
}: Props) {
  const ref = useRef<Konva.Layer>(null);
  const report = useCallback((bytes: number) => onCacheBytes(bytes), [onCacheBytes]);
  const hatch = useMemo(() => asPatternImage(hatchTile()), []);

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
          fillPatternImage={hatch}
          fillPatternRepeat="repeat"
          // The tile is 8px, but the pattern lives in map space — unscaled it is
          // subpixel at fit zoom and averages into a flat wash instead of hatching.
          fillPatternScale={{ x: HATCH_SCALE, y: HATCH_SCALE }}
          opacity={bandOpacity(index, bands.length)}
          stroke={PALETTE.ring}
          strokeWidth={1.2}
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
