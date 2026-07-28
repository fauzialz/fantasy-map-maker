import { Circle, Line, Rect } from "react-konva";
import { boundsCenter, type Bounds } from "../scene/bounds";
import { PALETTE } from "./palette";

interface Props {
  bounds?: Bounds;
  marquee: Bounds | null;
  /** current zoom — handles and strokes are sized in screen pixels, not map units */
  scale: number;
}

const ACCENT = "#22685B";
const HANDLE_PX = 9;
const ROTATE_OFFSET_PX = 26;

/**
 * The selection frame, its handles, and the marquee. Everything is divided by the zoom so
 * it stays a constant size on screen — a frame drawn in map units would vanish when
 * zoomed out and swamp the map when zoomed in.
 */
export function SelectionOverlay({ bounds, marquee, scale }: Props) {
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

      {bounds && (
        <>
          <Rect
            x={bounds.minX}
            y={bounds.minY}
            width={bounds.maxX - bounds.minX}
            height={bounds.maxY - bounds.minY}
            stroke={ACCENT}
            strokeWidth={px(1.5)}
            dash={[px(5), px(3)]}
          />
          <Line
            points={[
              boundsCenter(bounds).x,
              bounds.minY,
              boundsCenter(bounds).x,
              bounds.minY - px(ROTATE_OFFSET_PX),
            ]}
            stroke={ACCENT}
            strokeWidth={px(1.5)}
          />
          <Circle
            x={boundsCenter(bounds).x}
            y={bounds.minY - px(ROTATE_OFFSET_PX)}
            radius={px(HANDLE_PX * 0.6)}
            fill={PALETTE.paper}
            stroke={ACCENT}
            strokeWidth={px(1.5)}
          />
          {(
            [
              [bounds.minX, bounds.minY],
              [bounds.maxX, bounds.minY],
              [bounds.minX, bounds.maxY],
              [bounds.maxX, bounds.maxY],
            ] as const
          ).map(([x, y], i) => (
            <Rect
              key={i}
              x={x - px(HANDLE_PX / 2)}
              y={y - px(HANDLE_PX / 2)}
              width={px(HANDLE_PX)}
              height={px(HANDLE_PX)}
              fill={PALETTE.paper}
              stroke={ACCENT}
              strokeWidth={px(1.5)}
            />
          ))}
        </>
      )}
    </>
  );
}
