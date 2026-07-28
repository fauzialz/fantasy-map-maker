import { describe, expect, it } from "vitest";
import {
  cacheBytes,
  clampPan,
  clampScale,
  fitScale,
  MAX_SCALE,
  padRect,
  rectContains,
  visibleRect,
  zoomAt,
  type Size,
} from "./viewport";

const map: Size = { w: 4000, h: 3000 };
const view: Size = { w: 1200, h: 800 };
const fit = fitScale(map, view); // 800/3000 ≈ 0.2667

describe("clampScale", () => {
  it("never zooms out past the whole map", () => {
    expect(clampScale(0.001, map, view)).toBeCloseTo(fit);
    expect(fit * map.h).toBeCloseTo(view.h);
  });

  it("never zooms in past MAX_SCALE", () => {
    expect(clampScale(99, map, view)).toBe(MAX_SCALE);
  });

  it("keeps a valid range when the viewport dwarfs the map", () => {
    const tiny: Size = { w: 100, h: 100 };
    const big: Size = { w: 4000, h: 4000 };
    expect(clampScale(1, tiny, big)).toBe(fitScale(tiny, big));
  });
});

describe("clampPan", () => {
  it("centres an axis where the map is smaller than the viewport", () => {
    const vp = clampPan({ scale: fit, x: -9999, y: 0 }, map, view);
    expect(vp.x).toBeCloseTo((view.w - map.w * fit) / 2);
  });

  it("stops the map edge from leaving the viewport", () => {
    const zoomed = { scale: 1, x: 500, y: 500 };
    const vp = clampPan(zoomed, map, view);
    expect(vp.x).toBe(0);
    expect(vp.y).toBe(0);

    const far = clampPan({ scale: 1, x: -99999, y: -99999 }, map, view);
    expect(far.x).toBe(view.w - map.w);
    expect(far.y).toBe(view.h - map.h);
  });
});

describe("zoomAt", () => {
  it("keeps the map point under the cursor fixed", () => {
    const vp = { scale: 1, x: -1000, y: -800 };
    const pointer = { x: 400, y: 300 };
    const before = { x: (pointer.x - vp.x) / vp.scale, y: (pointer.y - vp.y) / vp.scale };

    const next = zoomAt(vp, pointer, 2, map, view);
    const after = { x: (pointer.x - next.x) / next.scale, y: (pointer.y - next.y) / next.scale };

    expect(next.scale).toBe(2);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it("stays clamped when zooming out at an edge", () => {
    const vp = zoomAt({ scale: 1, x: 0, y: 0 }, { x: 0, y: 0 }, 0.01, map, view);
    expect(vp.scale).toBeCloseTo(fit);
    expect(vp.x).toBeCloseTo((view.w - map.w * fit) / 2);
  });
});

describe("visibleRect / padRect / rectContains", () => {
  it("reports the map slice on screen", () => {
    const rect = visibleRect({ scale: 2, x: -100, y: -50 }, view);
    expect(rect).toEqual({ x: 50, y: 25, w: 600, h: 400 });
  });

  it("pads within the map bounds and contains the visible rect", () => {
    const vis = visibleRect({ scale: 1, x: -1000, y: -800 }, view);
    const padded = padRect(vis, 0.25, map);
    expect(rectContains(padded, vis)).toBe(true);
    expect(padded.x).toBeGreaterThanOrEqual(0);
    expect(padded.x + padded.w).toBeLessThanOrEqual(map.w);
  });

  it("clips padding at the map edge instead of overflowing", () => {
    const atOrigin = padRect({ x: 0, y: 0, w: 500, h: 400 }, 0.5, map);
    expect(atOrigin.x).toBe(0);
    expect(atOrigin.y).toBe(0);
  });

  it("rejects a visible rect that escaped the cached rect", () => {
    const cached = { x: 0, y: 0, w: 500, h: 500 };
    expect(rectContains(cached, { x: 400, y: 0, w: 200, h: 100 })).toBe(false);
  });
});

describe("cacheBytes", () => {
  it("stays viewport-sized instead of map-sized", () => {
    // What we actually allocate: the padded visible rect at pixelRatio = scale.
    const vis = visibleRect({ scale: 1, x: -1000, y: -800 }, view);
    const perLayer = cacheBytes(padRect(vis, 0.25, map), 1);
    const sixLayers = perLayer * 6;
    const fullMapSixLayers = map.w * map.h * 4 * 6;

    expect(sixLayers).toBeLessThan(60_000_000); // tens of MB
    expect(fullMapSixLayers).toBeGreaterThan(280_000_000); // the ~290 MB trap (ADR-19)
  });
});
