import { PALETTE } from "../canvas/palette";
import type { Label } from "../scene/types";

/**
 * Label text — the one sprite whose artwork lives in a font rather than in path data.
 *
 * That makes it the exception to the rule in `registry.ts`: a path can be measured from
 * its own numbers, but only the font engine knows a glyph's advance width. So this
 * measures with a canvas and caches, falling back to a proportional estimate where there
 * is no document (the bounds unit tests run in Node).
 */

/**
 * The scene stores `label.font` as a key ("fantasy-serif"), and v1 defines exactly one
 * face, so the key resolves here rather than in the object. Cinzel is self-hosted and
 * bundled (`index.css`) — never a CDN, which would be a CSP problem and would fall back
 * silently when it failed. A second face means turning this into a lookup on that key.
 *
 * The stack behind it still matters: canvas text does not wait for a webfont, so a label
 * drawn before Cinzel loads uses the next entry. `main.tsx` redraws once `document.fonts`
 * settles, which is also when the measurements below stop being estimates.
 */
const FAMILY = '"Cinzel", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';

export const labelFont = (size: number): string => `${size}px ${FAMILY}`;

/**
 * Measured at one reference size and scaled, because advance width is linear in font
 * size. Caching per (text, size) instead would grow without bound during a scale drag,
 * where the size changes on every frame.
 */
const REFERENCE_SIZE = 100;
const widths = new Map<string, number>();

let measurer: CanvasRenderingContext2D | null | undefined;
function measureContext(): CanvasRenderingContext2D | null {
  if (measurer === undefined) {
    measurer =
      typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  }
  return measurer;
}

function referenceWidth(text: string): number {
  const hit = widths.get(text);
  if (hit !== undefined) return hit;

  const context = measureContext();
  let width = text.length * REFERENCE_SIZE * 0.55;
  if (context) {
    context.font = labelFont(REFERENCE_SIZE);
    width = context.measureText(text).width;
  }
  widths.set(text, width);
  return width;
}

/**
 * The label's drawn box relative to its anchor. Unlike a sprite, a label is anchored at
 * its **centre** — text has no feet to stand on, and centring is what makes rotation spin
 * it in place (invariant I1).
 */
export function textBounds(text: string, size: number) {
  const width = (referenceWidth(text) * size) / REFERENCE_SIZE;
  // Cap height plus descender; close enough that the frame hugs the glyphs.
  const height = size * 0.95;
  return { left: -width / 2, right: width / 2, top: -height / 2, bottom: height / 2 };
}

/**
 * Labels sit above everything, often over dark sea or a busy coast, so each is drawn with
 * a paper-coloured halo first. Without it a label over the ocean is unreadable.
 */
export function drawLabel(context: CanvasRenderingContext2D, label: Label): void {
  if (!label.text) return;
  const size = label.size * label.scale;

  context.save();
  context.translate(label.x, label.y);
  if (label.rotation) context.rotate((label.rotation * Math.PI) / 180);
  context.font = labelFont(size);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = size * 0.16;
  context.strokeStyle = PALETTE.paper;
  context.strokeText(label.text, 0, 0);
  context.fillStyle = PALETTE.ink;
  context.fillText(label.text, 0, 0);
  context.restore();
}

/**
 * Advance widths belong to a face, so they are wrong until the real one has loaded — and
 * `textBounds` feeds the selection frame and hit-testing, not just the draw (invariant I2).
 */
export function clearTextMetrics(): void {
  widths.clear();
}
