import { memo } from "react";
import { Layer, Shape } from "react-konva";
import { drawVignette, type DrawContext } from "./draw";
import type { Size } from "./viewport";

/**
 * Decorative only — it holds no scene objects and is never interactive, so it sits
 * outside the fixed semantic layer stack.
 */
export const VignetteLayer = memo(function VignetteLayer({ map }: { map: Size }) {
  return (
    <Layer listening={false}>
      <Shape
        listening={false}
        sceneFunc={(context) => drawVignette(context as unknown as DrawContext, map)}
      />
    </Layer>
  );
});
