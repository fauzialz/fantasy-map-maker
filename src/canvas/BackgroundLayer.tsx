import { memo } from "react";
import { Layer, Shape } from "react-konva";
import { drawBackground, type DrawContext } from "./draw";
import type { Size } from "./viewport";

interface Props {
  map: Size;
  parchment: boolean;
}

export const BackgroundLayer = memo(function BackgroundLayer({ map, parchment }: Props) {
  return (
    <Layer listening={false}>
      <Shape
        listening={false}
        sceneFunc={(context) => drawBackground(context as unknown as DrawContext, map, parchment)}
      />
    </Layer>
  );
});
