import { Shape } from "react-konva";
import type { DrawContext } from "./draw";
import type { Landmass, Ring } from "../scene/types";

const ACCENT = "#22685B";

/**
 * A selected landmass reads as a **highlighted coastline, not a frame** (`08` §4 T1).
 *
 * That is not a styling preference. Until WP-15 makes terrain transforms actually move
 * geometry, a box with handles would promise a drag that `translateObjects` deliberately
 * refuses — the exact defect I9 exists to prevent. An outline says "selected" and promises
 * nothing else, which is the whole reason T1 ships before the handles do.
 *
 * Drawn at a screen-constant width like every other piece of selection chrome (I8), so it
 * neither vanishes at fit zoom nor swamps the coast up close.
 */
export function TerrainSelectionOverlay({
  landmasses,
  scale,
}: {
  landmasses: Landmass[];
  scale: number;
}) {
  if (landmasses.length === 0) return null;

  const trace = (ctx: DrawContext, ring: Ring) => {
    if (ring.length === 0) return;
    ctx.moveTo(ring[0][0], ring[0][1]);
    for (let i = 1; i < ring.length; i++) ctx.lineTo(ring[i][0], ring[i][1]);
    ctx.closePath();
  };

  return (
    <Shape
      listening={false}
      sceneFunc={(context) => {
        const ctx = context as unknown as DrawContext;
        ctx.save();
        ctx.beginPath();
        for (const landmass of landmasses) {
          trace(ctx, landmass.path);
          // Lakes are part of the coastline too — a selected landmass with a lake should
          // read as one outlined shape, hole included.
          for (const hole of landmass.holes) trace(ctx, hole);
        }
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2.5 / scale;
        ctx.lineJoin = "round";
        ctx.stroke();
        ctx.restore();
      }}
    />
  );
}
