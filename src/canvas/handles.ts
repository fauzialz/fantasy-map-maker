import { boundsCenter, boundsContainPoint, type Bounds } from "../scene/bounds";
import type { Point } from "../scene/types";

/** Handle size in *screen* pixels, so handles stay grabbable at any zoom. */
export const HANDLE_PX = 9;
export const ROTATE_OFFSET_PX = 26;

/** Corners scale; the knob on the stalk above rotates. */
export type Handle = "nw" | "ne" | "sw" | "se" | "rotate";
export type HandleKind = "scale" | "rotate";

export const handleKind = (handle: Handle): HandleKind =>
  handle === "rotate" ? "rotate" : "scale";

/** Which handle, if any, is under the point. */
export function handleAt(bounds: Bounds, [px, py]: Point, scale: number): Handle | undefined {
  const reach = HANDLE_PX / scale;
  const center = boundsCenter(bounds);
  const rotateY = bounds.minY - ROTATE_OFFSET_PX / scale;
  if (Math.hypot(px - center.x, py - rotateY) <= reach) return "rotate";

  const corners: [Handle, number, number][] = [
    ["nw", bounds.minX, bounds.minY],
    ["ne", bounds.maxX, bounds.minY],
    ["sw", bounds.minX, bounds.maxY],
    ["se", bounds.maxX, bounds.maxY],
  ];
  return corners.find(([, cx, cy]) => Math.hypot(px - cx, py - cy) <= reach)?.[0];
}

/**
 * CSS has no rotate cursor, so this is a drawn one: a circular arrow with a white
 * underlay so it stays legible over both parchment and deep water. Inlined as a data URI
 * — the app ships no cursor image files, same rule as every other asset here.
 */
const ROTATE_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>" +
  "<g fill='none' stroke='white' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round'>" +
  "<path d='M19 12a7 7 0 1 1-2-4.9'/><path d='M19 4v4h-4'/></g>" +
  "<g fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>" +
  "<path d='M19 12a7 7 0 1 1-2-4.9'/><path d='M19 4v4h-4'/></g></svg>";

export const ROTATE_CURSOR = `url("data:image/svg+xml;utf8,${encodeURIComponent(ROTATE_SVG)}") 12 12, grab`;

/**
 * The bounding box stays axis-aligned however the objects inside it are rotated, so the
 * diagonal resize cursors always match the corner they sit on.
 */
export function cursorForHandle(handle: Handle): string {
  switch (handle) {
    case "rotate":
      return ROTATE_CURSOR;
    case "nw":
    case "se":
      return "nwse-resize";
    case "ne":
    case "sw":
      return "nesw-resize";
  }
}

interface HoverInput {
  point: Point;
  bounds?: Bounds;
  selectionCount: number;
  overObject: boolean;
  scale: number;
}

/**
 * Cursor for a hover with the select tool, mirroring `resolveGesture`'s precedence so the
 * pointer always advertises what a press would actually do.
 */
export function cursorForHover({
  point,
  bounds,
  selectionCount,
  overObject,
  scale,
}: HoverInput): string | undefined {
  if (bounds && selectionCount > 0) {
    const handle = handleAt(bounds, point, scale);
    if (handle) return cursorForHandle(handle);
    if (boundsContainPoint(bounds, point[0], point[1])) return "move";
  }
  return overObject ? "pointer" : undefined;
}
