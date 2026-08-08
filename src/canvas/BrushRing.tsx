import { Circle } from "react-konva";
import type { Point } from "../scene/types";
import { PALETTE } from "./palette";

/** What the brush in hand does, which is what the ring has to say (`12` §1). */
export type BrushTone = "paint" | "sea" | "erase";

interface Props {
  at: Point;
  /** map units — the ring grows and shrinks with zoom exactly as the affected area does */
  radius: number;
  scale: number;
  tone: BrushTone;
}

/**
 * WP-24 — the ring that shows how big the brush is *before* you commit to a drag.
 *
 * The slider reads in map units and the canvas is 4000 px wide at fit zoom, so there was no
 * way to convert one to the other by looking: you had to make an edit and undo it.
 *
 * **Halo under, core over.** One ring passes over parchment, forest, snow, bare peak and open
 * sea within a single stroke, so no single colour stays legible against all of them. Two tones
 * — the brightest and the darkest the map palette has — mean the ring never has to know what
 * is underneath, and both tokens flip with the theme.
 *
 * **Weights are set against the art, not picked from a scale.** At 3 px and 1.25 px the ring
 * was thinner than the outlines the sprites are drawn with, so over a dense mountain field it
 * read as one more contour line and the dashed eraser ring disappeared outright — the exact
 * defect this package exists to remove. It has to out-weigh the map it sits on.
 *
 * **Stroke width is screen-constant (I8)**, like every other piece of chrome: a ring stroked
 * in map units would be a hairline at fit zoom and a band at 400 %.
 */
export function BrushRing({ at, radius, scale, tone }: Props) {
  const px = (value: number) => value / scale;
  // The sea brush previews as water already, so its ring matches; the object eraser has no
  // colour to borrow and says "removing" with a dashed stroke instead — which also reads
  // without relying on hue at all.
  const core = tone === "sea" ? PALETTE.seaDeep : PALETTE.ink;
  const dash = tone === "erase" ? [px(7), px(6)] : undefined;

  return (
    <>
      <Circle
        x={at[0]}
        y={at[1]}
        radius={radius}
        stroke={PALETTE.peakLit}
        strokeWidth={px(5)}
        dash={dash}
        opacity={0.9}
        listening={false}
      />
      <Circle
        x={at[0]}
        y={at[1]}
        radius={radius}
        stroke={core}
        strokeWidth={px(2)}
        dash={dash}
        listening={false}
      />
    </>
  );
}
