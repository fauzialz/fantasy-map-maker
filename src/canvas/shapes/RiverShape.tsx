import { useMemo } from "react";
import { Line } from "react-konva";
import { riverRibbon } from "../../engine/river";
import type { River } from "../../scene/types";
import { RIVER_FILL } from "../palette";

/**
 * A river is drawn as a filled ribbon rather than a stroked line, because the taper is
 * geometry — see `engine/river.ts`.
 *
 * Flat and opaque, with no stroke: see `RIVER_FILL`. That is what lets rivers branch —
 * two overlapping ribbons paint the same colour twice and the confluence is seamless,
 * including where a single ribbon's own banks cross on a tight bend.
 */
export function RiverShape({ river }: { river: River }) {
  const points = useMemo(() => riverRibbon(river).flat(), [river]);
  if (points.length === 0) return null;

  return <Line points={points} closed fill={RIVER_FILL} lineJoin="round" />;
}
