import { Shape } from "react-konva";
import type { DrawContext } from "./draw";
import type { Landmass, Ring } from "../scene/types";
import { PALETTE } from "./palette";

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
 *
 * **Two-tone since WP-25 — halo under, accent core over.** A single stroke had to be legible
 * against whatever it lands on, and what it lands on is not the biome fill: the highlight
 * traces the *coastline*, so it sits directly over `PALETTE.coast`, and dark teal on dark
 * brown measures **1.81:1**. The halo is what fixes that (10.9:1), and the core is what still
 * says "selected" over a pale fill where the halo itself would disappear. Between them one
 * always wins, which is why the question "what colour works on grassland *and* snow *and*
 * dark-mode desert" no longer needs an answer — the same reason marching ants are two-tone.
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
        ctx.lineJoin = "round";
        // One path, stroked twice — both screen-constant (I8).
        ctx.strokeStyle = PALETTE.peakLit;
        ctx.lineWidth = 6 / scale;
        ctx.stroke();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2.5 / scale;
        ctx.stroke();
        ctx.restore();
      }}
    />
  );
}
