import { boundsCenter, type Bounds } from "../scene/bounds";
import type { Point } from "../scene/types";

/** Handle size in *screen* pixels, so handles stay grabbable at any zoom. */
const HANDLE_PX = 9;
const ROTATE_OFFSET_PX = 26;

export type HandleKind = "scale" | "rotate";

/** Which handle, if any, is under the point. Corners scale; the stalk above rotates. */
export function handleAt(bounds: Bounds, [px, py]: Point, scale: number): HandleKind | undefined {
  const reach = HANDLE_PX / scale;
  const center = boundsCenter(bounds);
  const rotateY = bounds.minY - ROTATE_OFFSET_PX / scale;
  if (Math.hypot(px - center.x, py - rotateY) <= reach) return "rotate";

  const corners: Point[] = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.minX, bounds.maxY],
    [bounds.maxX, bounds.maxY],
  ];
  return corners.some(([cx, cy]) => Math.hypot(px - cx, py - cy) <= reach) ? "scale" : undefined;
}
