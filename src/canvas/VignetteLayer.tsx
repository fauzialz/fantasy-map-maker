import { memo } from "react";
import { Layer, Rect } from "react-konva";
import type { Size } from "./viewport";

/**
 * Aged-paper edge darkening, drawn above everything. Part of the parchment treatment,
 * so it follows the same toggle. Decorative only — it holds no scene objects and is
 * never interactive, so it sits outside the fixed semantic layer stack.
 */
export const VignetteLayer = memo(function VignetteLayer({ map }: { map: Size }) {
  const radius = Math.hypot(map.w, map.h) / 2;

  return (
    <Layer listening={false}>
      <Rect
        x={0}
        y={0}
        width={map.w}
        height={map.h}
        fillRadialGradientStartPoint={{ x: map.w / 2, y: map.h / 2 }}
        fillRadialGradientStartRadius={radius * 0.55}
        fillRadialGradientEndPoint={{ x: map.w / 2, y: map.h / 2 }}
        fillRadialGradientEndRadius={radius}
        fillRadialGradientColorStops={[0, "rgba(58,46,31,0)", 1, "rgba(58,46,31,0.16)"]}
      />
    </Layer>
  );
});
