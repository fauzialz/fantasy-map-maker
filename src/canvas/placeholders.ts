import type { LayerId } from "../scene/types";
import type { Rect, Size } from "./viewport";

/**
 * Stand-in geometry so the layer/caching strategy can be proven before any real tools
 * exist (WP-1 acceptance). Deleted once the layers render actual scene objects.
 */

/** mulberry32 — seeded so a given layer always draws the same placeholders. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const PLACEHOLDER_STYLE: Record<LayerId, { fill: string; size: number; count: number }> = {
  terrain: { fill: "#E7DAC0", size: 420, count: 40 },
  forests: { fill: "#3F6B4A", size: 26, count: 400 },
  mountains: { fill: "#6B6459", size: 40, count: 300 },
  rivers: { fill: "#4E8FA0", size: 90, count: 60 },
  icons: { fill: "#8A5A2B", size: 32, count: 150 },
  labels: { fill: "#1C2A27", size: 64, count: 80 },
};

export function placeholderRects(layerId: LayerId, map: Size): Rect[] {
  const { size, count } = PLACEHOLDER_STYLE[layerId];
  const next = rng(layerId.length * 7919 + layerId.charCodeAt(0) * 104729);
  return Array.from({ length: count }, () => {
    const w = size * (0.5 + next());
    const h = size * (0.5 + next());
    return { x: next() * (map.w - w), y: next() * (map.h - h), w, h };
  });
}
