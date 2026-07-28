import type Konva from "konva";
import { Shape } from "react-konva";
import type { Biome, Landmass, Ring } from "../../scene/types";

/** Placeholder palette — WP-5 replaces this with the real parchment/biome styling. */
const BIOME_FILL: Record<Biome, string> = {
  grassland: "#E7DAC0",
  forest: "#D8D2AE",
  desert: "#EFE0B4",
  snow: "#F2F3EF",
  swamp: "#CFCBA6",
};

const trace = (context: Konva.Context, ring: Ring) => {
  context.moveTo(ring[0][0], ring[0][1]);
  for (let i = 1; i < ring.length; i++) context.lineTo(ring[i][0], ring[i][1]);
  context.closePath();
};

/**
 * A landmass is an outer coastline plus holes (lakes). Holes are wound opposite to the
 * outer ring (S6), so the default non-zero fill rule cuts them out — nothing else needed.
 */
export function LandmassShape({ landmass }: { landmass: Landmass }) {
  return (
    <Shape
      fill={BIOME_FILL[landmass.biome]}
      stroke="#2C3A34"
      strokeWidth={2}
      sceneFunc={(context, shape) => {
        context.beginPath();
        trace(context, landmass.path);
        for (const hole of landmass.holes) trace(context, hole);
        context.fillStrokeShape(shape);
      }}
    />
  );
}
