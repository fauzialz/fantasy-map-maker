import { frameContains, toFrameLocal, type Frame } from "../scene/frame";
import type { Point } from "../scene/types";

/** Handle size in *screen* pixels, so handles stay grabbable at any zoom. */
export const HANDLE_PX = 9;
export const ROTATE_OFFSET_PX = 26;

/** Corners scale; the knob on the stalk above rotates. */
export type Handle = "nw" | "ne" | "sw" | "se" | "rotate";
export type HandleKind = "scale" | "rotate";

export const handleKind = (handle: Handle): HandleKind =>
  handle === "rotate" ? "rotate" : "scale";

/** Corner offsets in frame space, as fractions of the frame's half-size. */
const CORNERS: [Handle, number, number][] = [
  ["nw", -1, -1],
  ["ne", 1, -1],
  ["se", 1, 1],
  ["sw", -1, 1],
];

/**
 * Which handle is under the point.
 *
 * Everything is tested in frame space — the point is un-rotated into the frame first, so
 * a turned frame's handles are found by the same axis-aligned arithmetic as an upright
 * one, with no separate rotated-corner maths to drift out of step with the drawing.
 */
export function handleAt(frame: Frame, point: Point, scale: number): Handle | undefined {
  const reach = HANDLE_PX / scale;
  const [x, y] = toFrameLocal(frame, point);
  const hw = frame.width / 2;
  const hh = frame.height / 2;

  if (Math.hypot(x, y + hh + ROTATE_OFFSET_PX / scale) <= reach) return "rotate";
  return CORNERS.find(([, sx, sy]) => Math.hypot(x - sx * hw, y - sy * hh) <= reach)?.[0];
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

/** Resize cursors by direction, bucketed every 45°: →, ↘, ↓, ↙. */
const RESIZE = ["ew-resize", "nwse-resize", "ns-resize", "nesw-resize"];

/** Which way a corner points, in degrees, on an upright frame (screen y grows downward). */
const CORNER_ANGLE: Record<Exclude<Handle, "rotate">, number> = {
  se: 45,
  sw: 135,
  nw: 225,
  ne: 315,
};

/**
 * The cursor has to follow the frame's rotation: on a frame turned 90°, the "nw" corner
 * points where "ne" used to, and an unchanging nwse-resize would be lying about the axis
 * you are dragging along.
 */
export function cursorForHandle(handle: Handle, frameRotation = 0): string {
  if (handle === "rotate") return ROTATE_CURSOR;
  const angle = (((CORNER_ANGLE[handle] + frameRotation) % 180) + 180) % 180;
  return RESIZE[Math.round(angle / 45) % 4];
}

interface HoverInput {
  point: Point;
  frame?: Frame;
  overObject: boolean;
  scale: number;
}

/**
 * Cursor for a hover with the select tool, mirroring `resolveGesture`'s precedence so the
 * pointer always advertises what a press would actually do.
 */
export function cursorForHover({
  point,
  frame,
  overObject,
  scale,
}: HoverInput): string | undefined {
  if (frame) {
    const handle = handleAt(frame, point, scale);
    if (handle) return cursorForHandle(handle, frame.rotation);
    if (frameContains(frame, point)) return "move";
  }
  return overObject ? "pointer" : undefined;
}
