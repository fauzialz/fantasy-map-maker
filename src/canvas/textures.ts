import { createNoise4D } from "simplex-noise";
import { PALETTE } from "./palette";

/**
 * Procedural textures, generated once into small tiles and repeated across the map.
 *
 * Nothing is loaded from a URL: the P1 embed has to render offline from `file://` under
 * a strict CSP, so every asset here is drawn at runtime. Tiles are small (256px) and
 * repeated rather than one map-sized bitmap — a 4000x3000 parchment would cost 48 MB.
 */

const TILE = 256;

/** Seamless because the noise is sampled around two circles — a torus, so edges match. */
function seamlessNoise(seed: number) {
  let state = seed;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const noise4D = createNoise4D(random);

  return (x: number, y: number, frequency: number) => {
    const u = (x / TILE) * Math.PI * 2;
    const v = (y / TILE) * Math.PI * 2;
    const r = frequency / (Math.PI * 2);
    return noise4D(Math.cos(u) * r, Math.sin(u) * r, Math.cos(v) * r, Math.sin(v) * r);
  };
}

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

let parchment: HTMLCanvasElement | undefined;

/** Warm mottled paper: a few octaves of fBm plus fine grain. */
export function parchmentTile(): HTMLCanvasElement {
  if (parchment) return parchment;

  const canvas = document.createElement("canvas");
  canvas.width = TILE;
  canvas.height = TILE;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  const noise = seamlessNoise(20260721);
  const image = context.createImageData(TILE, TILE);
  const [lr, lg, lb] = hexToRgb(PALETTE.paper);
  const [dr, dg, db] = hexToRgb(PALETTE.paperShade);

  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      // fBm: broad blotches, then fibre, then grain
      const fbm = noise(x, y, 3) * 0.5 + noise(x, y, 7) * 0.3 + noise(x, y, 17) * 0.15;
      const grain = (Math.random() - 0.5) * 0.06;
      const t = Math.min(Math.max(0.5 + fbm * 0.5 + grain, 0), 1) * 0.8;

      const i = (y * TILE + x) * 4;
      image.data[i] = lr + (dr - lr) * t;
      image.data[i + 1] = lg + (dg - lg) * t;
      image.data[i + 2] = lb + (db - lb) * t;
      image.data[i + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);
  parchment = canvas;
  return canvas;
}

let hatch: HTMLCanvasElement | undefined;

/**
 * Diagonal hatching for the coastal rings — the engraved-chart look the layer stack
 * calls for ("coastal hatched rings"). Drawn three times so the 45° lines wrap cleanly.
 */
export function hatchTile(): HTMLCanvasElement {
  if (hatch) return hatch;

  const size = 8;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return canvas;

  context.strokeStyle = PALETTE.ring;
  context.lineWidth = 1.4;
  for (const offset of [-size, 0, size]) {
    context.beginPath();
    context.moveTo(offset, size);
    context.lineTo(offset + size, 0);
    context.stroke();
  }

  hatch = canvas;
  return canvas;
}

/**
 * Konva types `fillPatternImage` as HTMLImageElement, but the underlying
 * `createPattern` accepts any CanvasImageSource — a canvas included. One cast here
 * rather than at every call site.
 */
export const asPatternImage = (canvas: HTMLCanvasElement): HTMLImageElement =>
  canvas as unknown as HTMLImageElement;
