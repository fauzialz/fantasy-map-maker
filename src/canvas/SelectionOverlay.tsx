import { Circle, Group, Line, Rect } from "react-konva";
import type { Bounds } from "../scene/bounds";
import type { Frame } from "../scene/frame";
import { HANDLE_PX, ROTATE_OFFSET_PX } from "./handles";
import { PALETTE } from "./palette";

interface Props {
  frame?: Frame;
  marquee: Bounds | null;
  /** current zoom — handles and strokes are sized in screen pixels, not map units */
  scale: number;
}

const ACCENT = "#22685B";

/**
 * The selection frame, its handles, and the marquee.
 *
 * The frame is drawn inside a rotated group, so a single selected object's frame turns
 * with it and keeps describing the sprite as drawn. Everything is divided by the zoom so
 * it stays a constant size on screen — a frame drawn in map units would vanish when
 * zoomed out and swamp the map when zoomed in.
 */
export function SelectionOverlay({ frame, marquee, scale }: Props) {
  const px = (value: number) => value / scale;

  return (
    <>
      {marquee && (
        <Rect
          x={marquee.minX}
          y={marquee.minY}
          width={marquee.maxX - marquee.minX}
          height={marquee.maxY - marquee.minY}
          fill={`${ACCENT}22`}
          stroke={ACCENT}
          strokeWidth={px(1)}
          dash={[px(6), px(4)]}
        />
      )}

      {frame && (
        <Group x={frame.cx} y={frame.cy} rotation={frame.rotation}>
          <Rect
            x={-frame.width / 2}
            y={-frame.height / 2}
            width={frame.width}
            height={frame.height}
            stroke={ACCENT}
            strokeWidth={px(1.5)}
            dash={[px(5), px(3)]}
          />
          <Line
            points={[0, -frame.height / 2, 0, -frame.height / 2 - px(ROTATE_OFFSET_PX)]}
            stroke={ACCENT}
            strokeWidth={px(1.5)}
          />
          <Circle
            x={0}
            y={-frame.height / 2 - px(ROTATE_OFFSET_PX)}
            radius={px(HANDLE_PX * 0.6)}
            fill={PALETTE.paper}
            stroke={ACCENT}
            strokeWidth={px(1.5)}
          />
          {(
            [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ] as const
          ).map(([sx, sy], i) => (
            <Rect
              key={i}
              x={(sx * frame.width) / 2 - px(HANDLE_PX / 2)}
              y={(sy * frame.height) / 2 - px(HANDLE_PX / 2)}
              width={px(HANDLE_PX)}
              height={px(HANDLE_PX)}
              fill={PALETTE.paper}
              stroke={ACCENT}
              strokeWidth={px(1.5)}
            />
          ))}
        </Group>
      )}
    </>
  );
}
