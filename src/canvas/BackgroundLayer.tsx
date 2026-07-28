import { memo, useMemo } from "react";
import { Layer, Rect } from "react-konva";
import { PALETTE, SEA_OPACITY } from "./palette";
import { asPatternImage, parchmentTile } from "./textures";
import type { Size } from "./viewport";

interface Props {
  map: Size;
  parchment: boolean;
}

/**
 * Paper, then sea. The parchment covers the whole map and the sea is a translucent tint
 * over it, so the grain reads through the water instead of the water being a flat slab.
 * With `settings.parchment` off the paper falls back to a flat tone and the sea stays.
 */
export const BackgroundLayer = memo(function BackgroundLayer({ map, parchment }: Props) {
  const texture = useMemo(
    () => (parchment ? asPatternImage(parchmentTile()) : undefined),
    [parchment],
  );

  return (
    <Layer listening={false}>
      <Rect
        x={0}
        y={0}
        width={map.w}
        height={map.h}
        fill={texture ? undefined : PALETTE.paper}
        fillPatternImage={texture}
        fillPatternRepeat="repeat"
      />
      <Rect x={0} y={0} width={map.w} height={map.h} fill={PALETTE.sea} opacity={SEA_OPACITY} />
    </Layer>
  );
});
