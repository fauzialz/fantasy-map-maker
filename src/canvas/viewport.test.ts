import { describe, expect, it } from "vitest";
import {
  cacheBytes,
  clampPan,
  clampScale,
  fitScale,
  MAX_SCALE,
  MIN_FIT_FRACTION,
  PAN_SLACK,
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
  /**
   * WP-28 / ADR-38 reverses what this used to assert. `fitScale` was the floor as well as the
   * fitting scale, so you could never see the canvas as an object with edges. The floor is now
   * a fraction of fit — still a bound, just a wider one.
   */
  it("zooms out to half of fit, and no further", () => {
    expect(clampScale(0.001, map, view)).toBeCloseTo(fit * MIN_FIT_FRACTION);
    expect(fit * map.h).toBeCloseTo(view.h);
  });

  it("still lets the map fill the viewport at fit", () => {
    expect(clampScale(fit, map, view)).toBeCloseTo(fit);
  });

  it("never zooms in past MAX_SCALE", () => {
    expect(clampScale(99, map, view)).toBe(MAX_SCALE);
  });

  it("keeps a valid range when the viewport dwarfs the map", () => {
    const tiny: Size = { w: 100, h: 100 };
    const big: Size = { w: 4000, h: 4000 };
    expect(clampScale(1, tiny, big)).toBe(fitScale(tiny, big) * MIN_FIT_FRACTION);
  });
});

describe("clampPan", () => {
  it("centres an axis where the map is smaller than the viewport", () => {
    const vp = clampPan({ scale: fit, x: -9999, y: 0 }, map, view);
    expect(vp.x).toBeCloseTo((view.w - map.w * fit) / 2);
  });

  it("lets the map edge past the viewport edge, but only by the slack", () => {
    const zoomed = { scale: 1, x: 99999, y: 99999 };
    const vp = clampPan(zoomed, map, view);
    expect(vp.x).toBeCloseTo(view.w * PAN_SLACK);
    expect(vp.y).toBeCloseTo(view.h * PAN_SLACK);

    const far = clampPan({ scale: 1, x: -99999, y: -99999 }, map, view);
    expect(far.x).toBeCloseTo(view.w - map.w - view.w * PAN_SLACK);
    expect(far.y).toBeCloseTo(view.h - map.h - view.h * PAN_SLACK);
  });

  it("still holds a pan that was already legal", () => {
    const vp = clampPan({ scale: 1, x: -300, y: -200 }, map, view);
    expect(vp.x).toBe(-300);
    expect(vp.y).toBe(-200);
  });

  /** An axis the map does not fill is centred, slack or no slack — including at the floor. */
  it("centres at the zoom floor rather than letting a fully visible map slide", () => {
    const floor = fit * MIN_FIT_FRACTION;
    const vp = clampPan({ scale: floor, x: -9999, y: -9999 }, map, view);
    expect(vp.x).toBeCloseTo((view.w - map.w * floor) / 2);
    expect(vp.y).toBeCloseTo((view.h - map.h * floor) / 2);
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

  it("stays clamped when zooming out at an edge, and centres below fit", () => {
    const vp = zoomAt({ scale: 1, x: 0, y: 0 }, { x: 0, y: 0 }, 0.01, map, view);
    const floor = fit * MIN_FIT_FRACTION;
    expect(vp.scale).toBeCloseTo(floor);
    // Below fit the map no longer covers the viewport, so `clampPan` centres it on both axes —
    // the branch that already existed for narrow viewports now does the letterboxing for free.
    expect(vp.x).toBeCloseTo((view.w - map.w * floor) / 2);
    expect(vp.y).toBeCloseTo((view.h - map.h * floor) / 2);
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
