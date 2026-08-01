import { Circle, Group, Shape } from "react-konva";
import type { Point, River } from "../scene/types";
import { drawRiver, type DrawContext } from "./draw";
import { HANDLE_PX } from "./handles";
import { PALETTE } from "./palette";

interface Props {
  /** the river being drawn, rendered exactly as it will look once committed */
  preview: River | null;
  /** control points to expose for dragging */
  points: Point[];
  /** current zoom — handles are sized in screen pixels, not map units (I8) */
  scale: number;
}

const ACCENT = "#22685B";

export function RiverOverlay({ preview, points, scale }: Props) {
  const px = (value: number) => value / scale;

  return (
    <Group>
      {preview && (
        <Group opacity={0.65}>
          <Shape
            listening={false}
            sceneFunc={(context) => drawRiver(context as unknown as DrawContext, preview)}
          />
        </Group>
      )}
      {points.map(([x, y], index) => (
        <Circle
          key={index}
          x={x}
          y={y}
          radius={px(HANDLE_PX / 2)}
          fill={PALETTE.paper}
          stroke={ACCENT}
          strokeWidth={px(1.5)}
        />
      ))}
    </Group>
  );
}
